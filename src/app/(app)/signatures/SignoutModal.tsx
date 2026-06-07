"use client";

import { useState, useMemo, useRef } from "react";
import { createSignout } from "./actions";

type Soldier = { id: string; name: string; pn: string | null; companyId?: string | null; companyName?: string | null; enlisted?: boolean };
type Company = { id: string; name: string };
type Unit = { id: string; itemTypeId: string; itemName: string; serial: string; status: string; statusId: string; lotQuantity: number | null };
type Balance = { itemTypeId: string; itemName: string; unit: string; status: string; statusId: string; quantity: number };
type Kit = { id: string; name: string; lines: { name: string; qty: number }[] };
type Vehicle = { id: string; name: string; plate: string };

type CartSerial = { type: "serial"; unitId: string; itemName: string; serial: string; status: string; lotQty?: number; lotTotal?: number };
type CartQty = { type: "qty"; itemTypeId: string; itemName: string; unit: string; quantity: number; statusId: string; statusName: string; fromKit?: string };
type CartItem = CartSerial | CartQty;

export default function SignoutModal({
  soldiers, companies = [], balances = [], units, kits, vehicles, lockCompanyId,
}: {
  soldiers: Soldier[]; companies?: Company[]; balances?: Balance[];
  units: Unit[]; kits: Kit[]; vehicles: Vehicle[];
  lockCompanyId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [soldierId, setSoldierId] = useState("");
  const [companyFilter, setCompanyFilter] = useState(lockCompanyId ?? "");
  const [soldierSearch, setSoldierSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [kitId, setKitId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [physicalLocation, setPhysicalLocation] = useState("");
  const [method, setMethod] = useState<"QR" | "LINK" | "ONSITE">("ONSITE");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  // אצווה: דיאלוג בחירת כמות חלקית
  const [lotPicker, setLotPicker] = useState<{ unit: Unit; qty: number } | null>(null);

  const selectedSoldier = soldiers.find((s) => s.id === soldierId);
  const selectedKit = kits.find((k) => k.id === kitId);

  // חיילים מסוננים — לפי פלוגה+חיפוש
  const filteredSoldiers = useMemo(() => {
    return soldiers.filter((s) => {
      if (companyFilter && s.companyId !== companyFilter) return false;
      if (soldierSearch.trim()) {
        const q = soldierSearch.trim().toLowerCase();
        return s.name.toLowerCase().includes(q) || (s.pn ?? "").includes(q);
      }
      return true;
    }).slice(0, 200);
  }, [soldiers, companyFilter, soldierSearch]);

  // פריטים זמינים — סריאלי + כמותי, מסוננים לפי חיפוש; ומסירים אלו שכבר בעגלה
  const cartSerialIds = new Set(cart.filter((c) => c.type === "serial").map((c) => (c as CartSerial).unitId));
  const availableUnits = useMemo(() => {
    return units.filter((u) => {
      if (cartSerialIds.has(u.id)) return false;
      if (itemSearch.trim()) {
        const q = itemSearch.trim().toLowerCase();
        return u.itemName.toLowerCase().includes(q) || u.serial.toLowerCase().includes(q);
      }
      return true;
    });
  }, [units, cartSerialIds, itemSearch]);
  const availableBalances = useMemo(() => {
    return balances.filter((b) => {
      if (b.quantity < 1) return false;
      if (itemSearch.trim()) {
        const q = itemSearch.trim().toLowerCase();
        return b.itemName.toLowerCase().includes(q);
      }
      return true;
    });
  }, [balances, itemSearch]);

  const addSerial = (u: Unit) => {
    // ⚠️ פריט אצווה (lotQuantity>1) → פותח דיאלוג כמות
    if (u.lotQuantity && u.lotQuantity > 1) {
      setLotPicker({ unit: u, qty: u.lotQuantity });
      return;
    }
    setCart((c) => [...c, { type: "serial", unitId: u.id, itemName: u.itemName, serial: u.serial, status: u.status }]);
  };
  const confirmLotPick = () => {
    if (!lotPicker) return;
    const { unit, qty } = lotPicker;
    if (qty < 1 || qty > (unit.lotQuantity ?? 1)) return;
    setCart((c) => [...c, {
      type: "serial", unitId: unit.id, itemName: unit.itemName, serial: unit.serial, status: unit.status,
      lotQty: qty, lotTotal: unit.lotQuantity ?? qty,
    }]);
    setLotPicker(null);
  };

  const addQty = (b: Balance) => {
    const existing = cart.find((c) => c.type === "qty" && c.itemTypeId === b.itemTypeId && c.statusId === b.statusId);
    if (existing) {
      setCart((c) => c.map((x) => x === existing ? { ...(x as CartQty), quantity: Math.min(b.quantity, (x as CartQty).quantity + 1) } : x));
    } else {
      setCart((c) => [...c, { type: "qty", itemTypeId: b.itemTypeId, itemName: b.itemName, unit: b.unit, quantity: 1, statusId: b.statusId, statusName: b.status }]);
    }
  };

  const updateCartQty = (idx: number, n: number) => {
    setCart((c) => c.map((x, i) => i === idx ? { ...(x as CartQty), quantity: Math.max(1, n) } : x));
  };

  const removeCart = (idx: number) => setCart((c) => c.filter((_, i) => i !== idx));

  const reset = () => {
    setSoldierId(""); setCompanyFilter(lockCompanyId ?? ""); setSoldierSearch("");
    setItemSearch(""); setCart([]); setKitId(""); setVehicleId(""); setMethod("ONSITE"); setError(null);
    setBusy(false); submittingRef.current = false;
  };

  // ⚠️ בחירת ערכה — מרחיבה את הפריטים לעגלה (כל פריט עם קישור לערכה כדי שנוכל לעקוב)
  const onPickKit = (newKitId: string) => {
    // הסר פריטים שהיו מערכה קודמת
    setCart((c) => c.filter((x) => !(x.type === "qty" && (x as CartQty).fromKit === kitId)));
    setKitId(newKitId);
    if (!newKitId) return;
    const kit = kits.find((k) => k.id === newKitId);
    if (!kit) return;
    // פריטים מהערכה מתווספים כשורות כמותיות (השרת ימשוך SN לפריטים סריאליים אוטומטית)
    const newLines: CartQty[] = kit.lines.map((l) => ({
      type: "qty" as const,
      itemTypeId: `kit:${kit.id}:${l.name}`, // מזהה מדומה — לא נשלח לשרת (זה לא itemTypeId אמיתי)
      itemName: l.name,
      unit: "יח׳",
      quantity: l.qty,
      statusId: "",
      statusName: "מתוך ערכה",
      fromKit: newKitId,
    }));
    setCart((c) => [...c, ...newLines]);
  };

  async function submit() {
    // הגנת כפילות: ref מונע double-click מהיר; busy מונע submit נוסף אחרי click
    if (submittingRef.current || busy) return;
    setError(null);
    if (!soldierId) { setError("בחר חייל"); return; }
    if (cart.length === 0 && !kitId) { setError("הוסף לפחות פריט אחד או בחר ערכה"); return; }
    submittingRef.current = true;
    setBusy(true);
    const fd = new FormData();
    fd.append("soldierId", soldierId);
    fd.append("method", method);
    if (kitId) fd.append("kitId", kitId);
    if (vehicleId) fd.append("vehicleId", vehicleId);
    if (physicalLocation) fd.append("physicalLocation", physicalLocation);
    for (const c of cart) {
      if (c.type === "serial") {
        fd.append("serial", c.unitId);
        // אם זו חלוקת אצווה — שולחים את הכמות כדי שהשרת יפצל
        if (c.lotQty && c.lotTotal && c.lotQty < c.lotTotal) {
          fd.append(`lotQty:${c.unitId}`, String(c.lotQty));
        }
      }
      else if (c.type === "qty" && !c.fromKit) {
        // רק פריטים שנבחרו ידנית (לא מערכה — אלה מטופלים דרך kitId)
        fd.append("qtyItem", c.itemTypeId);
        fd.append("qtyValue", String(c.quantity));
        fd.append("qtyStatus", c.statusId);
      }
    }
    try {
      await createSignout(fd);
      // הצלחה: השרת יפנה לדף החתימה. אם הגענו לכאן ללא redirect — נסגור.
      reset(); setOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // NEXT_REDIRECT הוא אובייקט מיוחד — אם זה זה, פשוט מתעלמים (הניתוב בוצע)
      if (msg.includes("NEXT_REDIRECT")) return;
      setError(msg);
      submittingRef.current = false;
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium">
        ✍️ החתמת חייל
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden relative">
        {/* כותרת */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg">✍️ החתמת חייל על ציוד</h3>
            <p className="text-xs text-slate-300 mt-0.5">בחר חייל → הוסף פריטים מהמלאי לעגלה → אופן חתימה → שלח</p>
          </div>
          <button onClick={() => { reset(); setOpen(false); }} className="text-slate-300 hover:text-white text-2xl">✕</button>
        </div>

        {/* שורה 1: בחירת חייל — הכל בשורה אחת */}
        <div className="bg-blue-50 border-b border-blue-200 p-3 shrink-0">
          <div className="flex gap-2 items-end flex-wrap">
            {!lockCompanyId && companies.length > 0 && (
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">פלוגה</label>
                <select value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setSoldierId(""); }}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white min-w-32">
                  <option value="">כל הפלוגות</option>
                  {companies.map((c) => {
                    const cnt = soldiers.filter((s) => s.companyId === c.id).length;
                    return <option key={c.id} value={c.id}>{c.name} ({cnt})</option>;
                  })}
                </select>
              </div>
            )}
            <div className="flex-1 min-w-40">
              <label className="block text-[11px] text-slate-600 mb-0.5">חיפוש שם / מ.א.</label>
              <input value={soldierSearch} onChange={(e) => setSoldierSearch(e.target.value)} placeholder="הקלד..."
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white" />
            </div>
            <div className="flex-[2] min-w-48">
              <label className="block text-[11px] text-slate-600 mb-0.5">בחר חייל ({filteredSoldiers.length})</label>
              <select value={soldierId} onChange={(e) => setSoldierId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
                <option value="">— {filteredSoldiers.length === 0 ? "אין חיילים בפלוגה" : "בחר חייל"} —</option>
                {filteredSoldiers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.pn ? ` (${s.pn})` : ""}{s.companyName ? ` · ${s.companyName}` : ""}{s.enlisted === false ? " ⏳ לא מאושר" : ""}
                  </option>
                ))}
              </select>
              {filteredSoldiers.length === 0 && (
                <p className="text-[10px] text-rose-600 mt-1">⚠️ אין חיילים. הקם חיילים ב<a href="/soldiers" className="underline">חיילי הפלוגה</a> או <a href="/roster" target="_blank" className="underline">רוסטר השלישות</a>.</p>
              )}
            </div>
          </div>
          {selectedSoldier && (
            <div className="mt-2 bg-white border border-blue-300 rounded-lg px-3 py-1.5 text-sm flex items-center gap-2">
              <span className="text-lg">🪖</span>
              <b>{selectedSoldier.name}</b>
              <span className="font-mono text-xs text-slate-500">{selectedSoldier.pn}</span>
              {selectedSoldier.companyName && <span className="text-xs text-slate-500">· {selectedSoldier.companyName}</span>}
            </div>
          )}
        </div>

        {/* גוף: שתי עמודות — שמאל מלאי, ימין עגלה */}
        <div className="flex-1 grid md:grid-cols-2 gap-0 overflow-hidden min-h-0">
          {/* === עמודה ימינה (בעברית "ימין" קודם) — עגלה === */}
          <div className="border-l border-slate-200 flex flex-col bg-slate-50 order-2 md:order-1">
            <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-white">
              <div className="font-bold text-slate-800">🛒 עגלת חתימה ({cart.length})</div>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-xs text-rose-500 hover:text-rose-700">נקה הכל</button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {cart.length === 0 ? (
                <div className="text-center text-slate-400 py-10 text-sm">
                  עגלה ריקה.<br />לחץ על פריט במלאי כדי להוסיף.
                </div>
              ) : cart.map((c, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-lg p-2 flex items-center gap-2">
                  {c.type === "serial" ? (
                    <>
                      <span className="text-lg">{c.lotQty ? "💣" : "🔫"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {c.itemName}
                          {c.lotQty && (
                            <span className="mr-1 text-[10px] bg-orange-100 text-orange-800 rounded px-1.5 py-0.5">
                              אצווה · {c.lotQty}/{c.lotTotal}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 font-mono truncate">
                          {c.lotQty ? `לוט: ${c.serial}` : `SN: ${c.serial}`} · {c.status}
                        </div>
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
                      <span className="text-lg">{c.fromKit ? "🎒" : "📦"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{c.itemName}{c.fromKit && <span className="text-[10px] text-violet-600 mr-1">(מערכה)</span>}</div>
                        <div className="text-xs text-slate-500">{c.statusName}</div>
                      </div>
                      <input type="number" min={1} value={c.quantity}
                        onChange={(e) => updateCartQty(i, parseInt(e.target.value) || 1)}
                        className="w-16 rounded border border-slate-300 px-1.5 py-1 text-sm text-center" />
                      <span className="text-xs text-slate-400">{c.unit}</span>
                    </>
                  )}
                  <button onClick={() => removeCart(i)} className="text-rose-400 hover:text-rose-700 px-1">✕</button>
                </div>
              ))}
            </div>

            {/* תוספות מתחת לעגלה */}
            <div className="p-3 border-t border-slate-200 bg-white space-y-2">
              {/* מיקום פיזי — לכל פריט/ערכה (חייב להצמיד לאיפה החייל ישים את הציוד) */}
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">📍 מיקום פיזי (אופציונלי)</label>
                <input value={physicalLocation} onChange={(e) => setPhysicalLocation(e.target.value)}
                  placeholder="לדוגמה: ארון 3, מדף ב' / רכב 12345 / חדר ירי"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              {vehicles.length > 0 && cart.some((c) => c.type === "serial") && (
                <div>
                  <label className="block text-[11px] text-slate-600 mb-0.5">רכב (אופציונלי)</label>
                  <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                    <option value="">— ללא —</option>
                    {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} {v.plate}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">אופן חתימה</label>
                <div className="flex gap-1.5 text-xs">
                  {(["ONSITE", "QR", "LINK"] as const).map((m) => (
                    <label key={m} className={`flex-1 text-center px-2 py-1.5 rounded-lg border-2 cursor-pointer transition ${method === m ? "border-slate-800 bg-slate-100" : "border-slate-200"}`}>
                      <input type="radio" checked={method === m} onChange={() => setMethod(m)} className="hidden" />
                      {m === "ONSITE" ? "✍️ שרבוט (כאן)" : m === "QR" ? "📱 QR" : "💬 WhatsApp"}
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  {method === "ONSITE" ? "✍️ החייל יחתום ישירות במכשיר הזה" :
                   method === "QR" ? "📱 ייפתח QR שהחייל יסרוק במכשיר שלו" :
                   "💬 ייפתח לינק שתשלח לחייל בוואטסאפ"}
                </p>
              </div>
            </div>
          </div>

          {/* === עמודה שמאלית — מלאי זמין === */}
          <div className="flex flex-col bg-white order-1 md:order-2 min-h-0">
            <div className="p-3 border-b border-slate-200 bg-white sticky top-0 shrink-0 space-y-2">
              {/* ⬆ בורר ערכה — מעל המלאי (בחירה גוררת פריטים לעגלה אוטומטית) */}
              {kits.length > 0 && (
                <div className="bg-violet-50 border border-violet-200 rounded-lg p-2">
                  <label className="block text-[11px] font-semibold text-violet-900 mb-1">📦 ערכה מוכנה (מילוי אוטומטי של עגלה)</label>
                  <select value={kitId} onChange={(e) => onPickKit(e.target.value)}
                    className="w-full rounded-lg border border-violet-300 px-2 py-1.5 text-sm bg-white">
                    <option value="">— ללא ערכה / בחירה ידנית —</option>
                    {kits.map((k) => <option key={k.id} value={k.id}>{k.name} ({k.lines.length} פריטים)</option>)}
                  </select>
                  {selectedKit && (
                    <p className="text-[10px] text-violet-700 mt-1">
                      ✓ {selectedKit.lines.map((l) => `${l.name}×${l.qty}`).join(" · ")} — נוסף לעגלה. לחץ ✕ ליד פריט להסרה.
                    </p>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="font-bold text-slate-800">📦 מלאי זמין</div>
                <span className="text-xs text-slate-400">({availableUnits.length + availableBalances.length} פריטים)</span>
              </div>
              <input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="חפש פריט..."
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {availableUnits.length === 0 && availableBalances.length === 0 && (
                <div className="text-center text-slate-400 py-10 text-sm">
                  אין פריטים זמינים במחסן שלך.<br />הוסף מלאי קודם ב"מלאי המחסן".
                </div>
              )}

              {availableBalances.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-2 pb-1">כמותי — לחץ + להוספה</div>
                  {availableBalances.map((b) => (
                    <button key={`${b.itemTypeId}-${b.statusId}`} onClick={() => addQty(b)}
                      className="w-full text-right bg-white border border-slate-200 rounded-lg p-2 mb-1 hover:bg-emerald-50 hover:border-emerald-300 transition flex items-center gap-2 group">
                      <span className="text-lg">📦</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{b.itemName}</div>
                        <div className="text-xs text-slate-500">{b.status} · זמין: <b>{b.quantity}</b> {b.unit}</div>
                      </div>
                      <span className="text-emerald-600 font-bold text-lg group-hover:scale-110 transition">+</span>
                    </button>
                  ))}
                </div>
              )}

              {availableUnits.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-2 pb-1 pt-1">סריאלי / אצוות — לחץ להוספה</div>
                  {availableUnits.map((u) => {
                    const isLot = !!u.lotQuantity && u.lotQuantity > 1;
                    return (
                      <button key={u.id} onClick={() => addSerial(u)}
                        className={`w-full text-right bg-white border rounded-lg p-2 mb-1 hover:bg-blue-50 transition flex items-center gap-2 group ${isLot ? "border-orange-300 hover:border-orange-400" : "border-slate-200 hover:border-blue-300"}`}>
                        <span className="text-lg">{isLot ? "💣" : "🔫"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {u.itemName}
                            {isLot && <span className="mr-1 text-[10px] bg-orange-100 text-orange-800 rounded px-1.5 py-0.5">אצווה ×{u.lotQuantity}</span>}
                          </div>
                          <div className="text-xs text-slate-500 font-mono truncate">{isLot ? `לוט: ${u.serial}` : `SN: ${u.serial}`} · {u.status}</div>
                        </div>
                        <span className={`font-bold text-lg group-hover:scale-110 transition ${isLot ? "text-orange-600" : "text-blue-600"}`}>+</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* דיאלוג אצווה: בחירת כמות חלקית מתוך לוט */}
        {lotPicker && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10 p-3" onClick={() => setLotPicker(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-orange-500 to-orange-700 text-white p-4">
                <h3 className="font-bold text-lg flex items-center gap-2">⚠️ פריט אצווה</h3>
                <p className="text-xs text-orange-100 mt-1">ודא שזה הפריט הנכון לפני ההחתמה</p>
              </div>
              <div className="p-5 space-y-3">
                <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-3">
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">💣</span>
                    <div className="flex-1">
                      <div className="font-bold text-lg">{lotPicker.unit.itemName}</div>
                      <div className="text-xs text-slate-600 mt-1">מס׳ לוט: <span className="font-mono font-bold">{lotPicker.unit.serial}</span></div>
                      <div className="text-xs text-slate-600">סטטוס: {lotPicker.unit.status}</div>
                      <div className="text-xs text-slate-600">סה״כ באצווה: <span className="font-bold text-orange-700">{lotPicker.unit.lotQuantity}</span></div>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">כמות להחתמה</label>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: Math.max(1, p.qty - 1) } : p)}
                      className="w-10 h-10 rounded-lg border border-slate-300 text-lg font-bold hover:bg-slate-50">−</button>
                    <input type="number" min={1} max={lotPicker.unit.lotQuantity ?? 1} value={lotPicker.qty}
                      onChange={(e) => setLotPicker((p) => p ? { ...p, qty: Math.max(1, Math.min(lotPicker.unit.lotQuantity ?? 1, parseInt(e.target.value) || 1)) } : p)}
                      className="flex-1 rounded-lg border-2 border-orange-300 px-3 py-2 text-2xl font-bold text-center" autoFocus />
                    <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: Math.min(lotPicker.unit.lotQuantity ?? 1, p.qty + 1) } : p)}
                      className="w-10 h-10 rounded-lg border border-slate-300 text-lg font-bold hover:bg-slate-50">+</button>
                  </div>
                  <div className="flex justify-between mt-2 text-xs">
                    <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: 1 } : p)} className="text-blue-600 hover:underline">1 בלבד</button>
                    <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: Math.floor((lotPicker.unit.lotQuantity ?? 1) / 2) } : p)} className="text-blue-600 hover:underline">חצי</button>
                    <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: lotPicker.unit.lotQuantity ?? 1 } : p)} className="text-blue-600 hover:underline">הכל ({lotPicker.unit.lotQuantity})</button>
                  </div>
                  {lotPicker.qty < (lotPicker.unit.lotQuantity ?? 1) && (
                    <p className="text-[11px] text-amber-700 mt-2 bg-amber-50 rounded p-2">
                      ℹ️ האצווה תתפצל: <b>{lotPicker.qty}</b> יחידות יעברו לחייל, ו-<b>{(lotPicker.unit.lotQuantity ?? 1) - lotPicker.qty}</b> יישארו במחסן באותו מס׳ לוט.
                    </p>
                  )}
                </div>
              </div>
              <div className="p-3 border-t border-slate-200 flex gap-2">
                <button onClick={() => setLotPicker(null)} className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm">ביטול</button>
                <button onClick={confirmLotPick} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white rounded-lg px-4 py-2.5 text-sm font-bold">
                  ✓ הוסף לעגלה ({lotPicker.qty})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* footer */}
        <div className="border-t border-slate-200 p-3 bg-white shrink-0">
          {error && <div className="text-sm text-rose-700 font-medium mb-2">⚠️ {error}</div>}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => { reset(); setOpen(false); }} disabled={busy}
              className="flex-1 sm:flex-none rounded-lg border border-slate-300 px-4 py-2.5 text-sm disabled:opacity-50">ביטול</button>
            <button onClick={submit} disabled={busy || !soldierId || (cart.length === 0 && !kitId)}
              className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-5 py-2.5 text-sm font-bold flex items-center justify-center gap-2">
              {busy ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  שולח...
                </>
              ) : (
                <>{method === "ONSITE" ? "✍️ עבור לחתימה" : "🚀 הפעל החתמה"} ({cart.length}{kitId ? " + ערכה" : ""})</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
