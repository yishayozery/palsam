"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createCompanySign } from "./company-actions";
import { useEscClose } from "@/lib/useEscClose";

type Member = { id: string; name: string; role: string };
type Company = { id: string; name: string; members: Member[] };
type Unit = { id: string; itemTypeId: string; itemName: string; serial: string; status: string; statusId: string; signMode: "COMPANY" | "SOLDIER"; lotQuantity: number | null };
type Balance = { itemTypeId: string; itemName: string; unit: string; status: string; statusId: string; quantity: number; signMode: "COMPANY" | "SOLDIER" };

type CartSerial = { type: "serial"; unitId: string; itemName: string; serial: string; status: string; lotQty?: number; lotTotal?: number };
type CartQty = { type: "qty"; itemTypeId: string; itemName: string; unit: string; quantity: number; statusId: string; statusName: string };
type CartItem = CartSerial | CartQty;

export default function CompanySignModal({
  companies, units, balances,
}: { companies: Company[]; units: Unit[]; balances: Balance[]; }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [recipientUserId, setRecipientUserId] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [method, setMethod] = useState<"QR" | "LINK" | "ONSITE">("ONSITE");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const [lotPicker, setLotPicker] = useState<{ unit: Unit; qty: number } | null>(null);

  useEscClose(open && !lotPicker, () => { reset(); setOpen(false); });

  const selectedCompany = companies.find((c) => c.id === companyId);
  // מיון לפי תפקיד (title): רס"פ ראשון, מ"פ/מ"פלג שני, השאר אחרון
  const availableMembers = useMemo(() => {
    if (!selectedCompany) return [];
    const priority = (m: Member): number => {
      const t = (m.role || "");
      if (t.includes('רס"פ') || t.includes("רספ")) return 0;
      if (t.includes('מ"פ') || t.includes("מפ")) return 1;
      return 2;
    };
    return [...selectedCompany.members].sort((a, b) => priority(a) - priority(b));
  }, [selectedCompany]);

  // בחירה אוטומטית של הראשון (= רס"פ) ברגע שמשתנה הפלוגה
  useEffect(() => {
    if (availableMembers.length > 0 && !recipientUserId) {
      setRecipientUserId(availableMembers[0].id);
    }
  }, [availableMembers, recipientUserId]);

  const cartSerialIds = new Set(cart.filter((c) => c.type === "serial").map((c) => (c as CartSerial).unitId));
  const companyUnits = useMemo(() => units.filter((u) =>
    u.signMode === "COMPANY" && !cartSerialIds.has(u.id) &&
    (!itemSearch.trim() || u.itemName.toLowerCase().includes(itemSearch.toLowerCase()) || u.serial.toLowerCase().includes(itemSearch.toLowerCase()))
  ), [units, cartSerialIds, itemSearch]);
  const companyBalances = useMemo(() => balances.filter((b) =>
    b.signMode === "COMPANY" && b.quantity > 0 &&
    (!itemSearch.trim() || b.itemName.toLowerCase().includes(itemSearch.toLowerCase()))
  ), [balances, itemSearch]);

  const addSerial = (u: Unit) => {
    if (u.lotQuantity && u.lotQuantity > 1) { setLotPicker({ unit: u, qty: u.lotQuantity }); return; }
    setCart((c) => [...c, { type: "serial", unitId: u.id, itemName: u.itemName, serial: u.serial, status: u.status }]);
  };
  const confirmLotPick = () => {
    if (!lotPicker) return;
    const { unit, qty } = lotPicker;
    if (qty < 1 || qty > (unit.lotQuantity ?? 1)) return;
    setCart((c) => [...c, { type: "serial", unitId: unit.id, itemName: unit.itemName, serial: unit.serial, status: unit.status, lotQty: qty, lotTotal: unit.lotQuantity ?? qty }]);
    setLotPicker(null);
  };
  const addQty = (b: Balance) => {
    const existing = cart.find((c) => c.type === "qty" && c.itemTypeId === b.itemTypeId && c.statusId === b.statusId);
    if (existing) setCart((c) => c.map((x) => x === existing ? { ...(x as CartQty), quantity: Math.min(b.quantity, (x as CartQty).quantity + 1) } : x));
    else setCart((c) => [...c, { type: "qty", itemTypeId: b.itemTypeId, itemName: b.itemName, unit: b.unit, quantity: 1, statusId: b.statusId, statusName: b.status }]);
  };
  const updateCartQty = (idx: number, n: number) => setCart((c) => c.map((x, i) => i === idx ? { ...(x as CartQty), quantity: Math.max(1, n) } : x));
  const removeCart = (idx: number) => setCart((c) => c.filter((_, i) => i !== idx));
  const reset = () => {
    setCompanyId(""); setRecipientUserId(""); setItemSearch(""); setCart([]); setMethod("ONSITE"); setError(null);
    setBusy(false); submittingRef.current = false;
  };

  async function submit() {
    if (submittingRef.current || busy) return; // הגנת כפילות
    setError(null);
    if (!companyId) { setError("בחר פלוגה"); return; }
    if (!recipientUserId) { setError("⚠️ לא נבחר נמען לחתימה — אי אפשר להחתים פלוגה בלי שיש מי שיחתום (מ״פ / רס״פ)"); return; }
    if (cart.length === 0) { setError("הוסף לפחות פריט אחד לעגלה"); return; }
    submittingRef.current = true;
    setBusy(true);
    const fd = new FormData();
    fd.append("companyId", companyId);
    fd.append("recipientUserId", recipientUserId);
    fd.append("method", method);
    for (const c of cart) {
      if (c.type === "serial") {
        fd.append("serial", c.unitId);
        if (c.lotQty && c.lotTotal && c.lotQty < c.lotTotal) {
          fd.append(`lotQty:${c.unitId}`, String(c.lotQty));
        }
      }
      else fd.append(`qty:${c.itemTypeId}:${c.statusId}`, String(c.quantity));
    }
    try {
      const result = await createCompanySign(fd);
      const token = result.token;
      reset();
      setOpen(false);
      // ⚠️ שרבוט (ONSITE) → ישר למסך חתימה במכשיר; QR/WhatsApp → מסך השיתוף
      if (method === "ONSITE") router.push(`/sign/${token}`);
      else router.push(`/signatures/${token}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("NEXT_REDIRECT")) return;
      setError(msg);
      submittingRef.current = false;
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="bg-purple-700 hover:bg-purple-800 text-white rounded-lg px-4 py-2 text-sm font-medium">
        🏛️ החתמת פלוגה
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden relative">
        <div className="bg-gradient-to-r from-purple-700 to-purple-900 text-white p-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg">🏛️ החתמת פלוגה</h3>
            <p className="text-xs text-purple-100 mt-0.5">פלוגה → נמען חותם (מ״פ/רס״פ) → פריטים → אופן חתימה</p>
          </div>
          <button onClick={() => { reset(); setOpen(false); }} className="text-purple-200 hover:text-white text-2xl">✕</button>
        </div>

        <div className="bg-purple-50 border-b border-purple-200 p-3 shrink-0">
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-40">
              <label className="block text-[11px] text-slate-600 mb-0.5">פלוגה</label>
              <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setRecipientUserId(""); }}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
                <option value="">— בחר פלוגה —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.members.length} בעלי תפקיד)</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-40">
              <label className="block text-[11px] text-slate-600 mb-0.5">נמען חותם (רס״פ ראשון כברירת מחדל)</label>
              <select value={recipientUserId} onChange={(e) => setRecipientUserId(e.target.value)} disabled={!companyId}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white disabled:bg-slate-100">
                <option value="">— {companyId ? "בחר נמען" : "בחר פלוגה קודם"} —</option>
                {availableMembers.map((m) => <option key={m.id} value={m.id}>{m.name}{m.role ? `  —  ${m.role}` : ""}</option>)}
              </select>
            </div>
          </div>
          {selectedCompany && availableMembers.length === 0 && (
            <div className="mt-2 bg-rose-50 border-2 border-rose-300 rounded-lg p-3 text-sm text-rose-900">
              <div className="font-bold mb-1">⛔ לא ניתן להחתים את הפלוגה</div>
              <p className="text-xs mb-2">
                אין רס״פ או מ״פ פעיל בפלוגה <b>{selectedCompany.name}</b>. צריך מישהו שיחתום על קבלת הציוד.
              </p>
              <div className="flex gap-2 text-xs">
                <a href="/reps" className="bg-rose-700 text-white rounded px-3 py-1.5 hover:bg-rose-800">+ הזמן רס״פ ל-{selectedCompany.name}</a>
                <a href="/org" className="border border-rose-300 rounded px-3 py-1.5 hover:bg-rose-100">/org</a>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 grid md:grid-cols-2 gap-0 overflow-hidden min-h-0">
          <div className="border-l border-slate-200 flex flex-col bg-slate-50 order-2 md:order-1">
            <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-white">
              <div className="font-bold text-slate-800">🛒 עגלת החתמה ({cart.length})</div>
              {cart.length > 0 && <button onClick={() => setCart([])} className="text-xs text-rose-500">נקה</button>}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {cart.length === 0 ? (
                <div className="text-center text-slate-400 py-10 text-sm">עגלה ריקה.<br />לחץ על פריט במלאי כדי להוסיף.</div>
              ) : cart.map((c, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-lg p-2 flex items-center gap-2">
                  <span className="text-lg">{c.type === "serial" && c.lotQty ? "💣" : "📦"}</span>
                  {c.type === "serial" ? (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {c.itemName}
                          {c.lotQty && <span className="mr-1 text-[10px] bg-orange-100 text-orange-800 rounded px-1.5 py-0.5">אצווה · {c.lotQty}/{c.lotTotal}</span>}
                        </div>
                        <div className="text-xs text-slate-500 font-mono truncate">{c.lotQty ? `לוט: ${c.serial}` : `SN: ${c.serial}`} · {c.status}</div>
                      </div>
                      {c.lotQty && (
                        <input type="number" min={1} max={c.lotTotal} value={c.lotQty}
                          onChange={(e) => {
                            const n = Math.max(1, Math.min(c.lotTotal ?? 1, parseInt(e.target.value) || 1));
                            setCart((arr) => arr.map((x, j) => j === i ? { ...(x as CartSerial), lotQty: n } : x));
                          }}
                          className="w-14 rounded border border-slate-300 px-1.5 py-1 text-sm text-center" />
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{c.itemName}</div>
                        <div className="text-xs text-slate-500">{c.statusName}</div>
                      </div>
                      <input type="number" min={1} value={c.quantity} onChange={(e) => updateCartQty(i, parseInt(e.target.value) || 1)}
                        className="w-16 rounded border border-slate-300 px-1.5 py-1 text-sm text-center" />
                      <span className="text-xs text-slate-400">{c.unit}</span>
                    </>
                  )}
                  <button onClick={() => removeCart(i)} className="text-rose-400 hover:text-rose-700 px-1">✕</button>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-slate-200 bg-white">
              <label className="block text-[11px] text-slate-600 mb-0.5">אופן חתימה</label>
              <div className="flex gap-1.5 text-xs">
                {(["ONSITE", "QR", "LINK"] as const).map((m) => (
                  <label key={m} className={`flex-1 text-center px-2 py-1.5 rounded-lg border-2 cursor-pointer transition ${method === m ? "border-purple-700 bg-purple-100" : "border-slate-200"}`}>
                    <input type="radio" checked={method === m} onChange={() => setMethod(m)} className="hidden" />
                    {m === "ONSITE" ? "✍️ שרבוט (כאן)" : m === "QR" ? "📱 QR" : "💬 WhatsApp"}
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                {method === "ONSITE" ? "✍️ ייפתח מסך חתימה ישירות במכשיר הזה" :
                 method === "QR" ? "📱 ייפתח QR שהנמען יסרוק במכשיר שלו" :
                 "💬 ייפתח לינק לשליחה בוואטסאפ"}
              </p>
            </div>
          </div>

          <div className="flex flex-col bg-white order-1 md:order-2 min-h-0">
            <div className="p-3 border-b border-slate-200 bg-white sticky top-0 shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <div className="font-bold text-slate-800">📦 מלאי להחתמת פלוגה</div>
                <span className="text-xs text-slate-400">({companyUnits.length + companyBalances.length})</span>
              </div>
              <input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="חפש פריט..."
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
              <p className="text-[11px] text-slate-500 mt-1">⚠️ רובים ופריטים שדורשים חתימת חייל אישית לא יוצגים כאן</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {companyUnits.length === 0 && companyBalances.length === 0 && (
                <div className="text-center text-slate-400 py-10 text-sm">
                  אין פריטים שמתאימים להחתמת פלוגה.<br/>
                  (פריטים אישיים כמו נשק — דרך &quot;החתמת חייל&quot;)
                </div>
              )}
              {companyBalances.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-2 pb-1">כמותי</div>
                  {companyBalances.map((b) => (
                    <button key={`${b.itemTypeId}-${b.statusId}`} onClick={() => addQty(b)}
                      className="w-full text-right bg-white border border-slate-200 rounded-lg p-2 mb-1 hover:bg-purple-50 hover:border-purple-300 transition flex items-center gap-2 group">
                      <span className="text-lg">📦</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{b.itemName}</div>
                        <div className="text-xs text-slate-500">{b.status} · זמין: <b>{b.quantity}</b> {b.unit}</div>
                      </div>
                      <span className="text-purple-600 font-bold text-lg group-hover:scale-110 transition">+</span>
                    </button>
                  ))}
                </div>
              )}
              {companyUnits.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-2 pb-1 pt-1">סריאלי / אצוות</div>
                  {companyUnits.map((u) => {
                    const isLot = !!u.lotQuantity && u.lotQuantity > 1;
                    return (
                      <button key={u.id} onClick={() => addSerial(u)}
                        className={`w-full text-right bg-white border rounded-lg p-2 mb-1 hover:bg-purple-50 transition flex items-center gap-2 group ${isLot ? "border-orange-300 hover:border-orange-400" : "border-slate-200 hover:border-purple-300"}`}>
                        <span className="text-lg">{isLot ? "💣" : "📦"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {u.itemName}
                            {isLot && <span className="mr-1 text-[10px] bg-orange-100 text-orange-800 rounded px-1.5 py-0.5">אצווה ×{u.lotQuantity}</span>}
                          </div>
                          <div className="text-xs text-slate-500 font-mono truncate">{isLot ? `לוט: ${u.serial}` : `SN: ${u.serial}`} · {u.status}</div>
                        </div>
                        <span className={`font-bold text-lg group-hover:scale-110 transition ${isLot ? "text-orange-600" : "text-purple-600"}`}>+</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* דיאלוג אצווה */}
        {lotPicker && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10 p-3" onClick={() => setLotPicker(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-orange-500 to-orange-700 text-white p-4">
                <h3 className="font-bold text-lg">⚠️ פריט אצווה</h3>
                <p className="text-xs text-orange-100 mt-1">ודא שזה הפריט הנכון לפני ההחתמה</p>
              </div>
              <div className="p-5 space-y-3">
                <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-3 flex items-start gap-3">
                  <span className="text-3xl">💣</span>
                  <div className="flex-1">
                    <div className="font-bold text-lg">{lotPicker.unit.itemName}</div>
                    <div className="text-xs text-slate-600 mt-1">מס׳ לוט: <span className="font-mono font-bold">{lotPicker.unit.serial}</span></div>
                    <div className="text-xs text-slate-600">סטטוס: {lotPicker.unit.status}</div>
                    <div className="text-xs text-slate-600">סה״כ באצווה: <span className="font-bold text-orange-700">{lotPicker.unit.lotQuantity}</span></div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">כמות להחתמה</label>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: Math.max(1, p.qty - 1) } : p)}
                      className="w-10 h-10 rounded-lg border border-slate-300 text-lg font-bold">−</button>
                    <input type="number" min={1} max={lotPicker.unit.lotQuantity ?? 1} value={lotPicker.qty}
                      onChange={(e) => setLotPicker((p) => p ? { ...p, qty: Math.max(1, Math.min(lotPicker.unit.lotQuantity ?? 1, parseInt(e.target.value) || 1)) } : p)}
                      className="flex-1 rounded-lg border-2 border-orange-300 px-3 py-2 text-2xl font-bold text-center" autoFocus />
                    <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: Math.min(lotPicker.unit.lotQuantity ?? 1, p.qty + 1) } : p)}
                      className="w-10 h-10 rounded-lg border border-slate-300 text-lg font-bold">+</button>
                  </div>
                  <div className="flex justify-between mt-2 text-xs">
                    <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: 1 } : p)} className="text-blue-600 hover:underline">1 בלבד</button>
                    <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: Math.floor((lotPicker.unit.lotQuantity ?? 1) / 2) } : p)} className="text-blue-600 hover:underline">חצי</button>
                    <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: lotPicker.unit.lotQuantity ?? 1 } : p)} className="text-blue-600 hover:underline">הכל ({lotPicker.unit.lotQuantity})</button>
                  </div>
                  {lotPicker.qty < (lotPicker.unit.lotQuantity ?? 1) && (
                    <p className="text-[11px] text-amber-700 mt-2 bg-amber-50 rounded p-2">
                      ℹ️ האצווה תתפצל: <b>{lotPicker.qty}</b> יעברו לפלוגה, ו-<b>{(lotPicker.unit.lotQuantity ?? 1) - lotPicker.qty}</b> יישארו במחסן.
                    </p>
                  )}
                </div>
              </div>
              <div className="p-3 border-t border-slate-200 flex gap-2">
                <button onClick={() => setLotPicker(null)} className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm">ביטול</button>
                <button onClick={confirmLotPick} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white rounded-lg px-4 py-2.5 text-sm font-bold">
                  ✓ הוסף ({lotPicker.qty})
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-slate-200 p-3 bg-white shrink-0">
          {error && <div className="text-sm text-rose-700 font-medium mb-2">⚠️ {error}</div>}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => { reset(); setOpen(false); }} disabled={busy}
              className="flex-1 sm:flex-none rounded-lg border border-slate-300 px-4 py-2.5 text-sm disabled:opacity-50">ביטול</button>
            <button onClick={submit} disabled={busy || !companyId || !recipientUserId || cart.length === 0}
              className="flex-1 sm:flex-none bg-purple-700 hover:bg-purple-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-5 py-2.5 text-sm font-bold flex items-center justify-center gap-2">
              {busy ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  שולח...
                </>
              ) : (
                <>{method === "ONSITE" ? "✍️ עבור לחתימה" : "🚀 הפעל החתמה"} ({cart.length})</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
