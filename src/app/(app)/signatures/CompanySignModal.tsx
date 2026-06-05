"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createCompanySign } from "./company-actions";

type Member = { id: string; name: string; role: string };
type Company = { id: string; name: string; members: Member[] };
type Unit = { id: string; itemTypeId: string; itemName: string; serial: string; status: string; statusId: string; signMode: "COMPANY" | "SOLDIER" };
type Balance = { itemTypeId: string; itemName: string; unit: string; status: string; statusId: string; quantity: number; signMode: "COMPANY" | "SOLDIER" };

type CartSerial = { type: "serial"; unitId: string; itemName: string; serial: string; status: string };
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

  const selectedCompany = companies.find((c) => c.id === companyId);
  // מיון: רס"פ ראשון, מ"פ שני, השאר אחרון
  const availableMembers = useMemo(() => {
    if (!selectedCompany) return [];
    const priority = (m: Member): number => {
      const r = (m.role || "").toLowerCase();
      const t = (m.role || "").includes('רס"פ') || r.includes("rep");
      if (t) return 0;
      if ((m.role || "").includes('מ"פ') || (m.role || "").includes("מפ")) return 1;
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

  const addSerial = (u: Unit) => setCart((c) => [...c, { type: "serial", unitId: u.id, itemName: u.itemName, serial: u.serial, status: u.status }]);
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
      if (c.type === "serial") fd.append("serial", c.unitId);
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden">
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
                  <span className="text-lg">📦</span>
                  {c.type === "serial" ? (
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{c.itemName}</div>
                      <div className="text-xs text-slate-500 font-mono truncate">SN: {c.serial} · {c.status}</div>
                    </div>
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
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-2 pb-1 pt-1">סריאלי</div>
                  {companyUnits.map((u) => (
                    <button key={u.id} onClick={() => addSerial(u)}
                      className="w-full text-right bg-white border border-slate-200 rounded-lg p-2 mb-1 hover:bg-purple-50 hover:border-purple-300 transition flex items-center gap-2 group">
                      <span className="text-lg">📦</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{u.itemName}</div>
                        <div className="text-xs text-slate-500 font-mono truncate">SN: {u.serial} · {u.status}</div>
                      </div>
                      <span className="text-purple-600 font-bold text-lg group-hover:scale-110 transition">+</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

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
