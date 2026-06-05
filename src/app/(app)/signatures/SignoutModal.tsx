"use client";

import { useState, useMemo } from "react";
import { createSignout } from "./actions";

type Soldier = { id: string; name: string; pn: string | null; companyId?: string | null; companyName?: string | null };
type Company = { id: string; name: string };
type Unit = { id: string; itemTypeId: string; itemName: string; serial: string; status: string; statusId: string };
type Balance = { itemTypeId: string; itemName: string; unit: string; status: string; statusId: string; quantity: number };
type Kit = { id: string; name: string; lines: { name: string; qty: number }[] };
type Vehicle = { id: string; name: string; plate: string };

type CartSerial = { type: "serial"; unitId: string; itemName: string; serial: string; status: string };
type CartQty = { type: "qty"; itemTypeId: string; itemName: string; unit: string; quantity: number; statusId: string; statusName: string };
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
  const [method, setMethod] = useState<"QR" | "LINK" | "ONSITE">("QR");
  const [error, setError] = useState<string | null>(null);

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

  const addSerial = (u: Unit) =>
    setCart((c) => [...c, { type: "serial", unitId: u.id, itemName: u.itemName, serial: u.serial, status: u.status }]);

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
    setItemSearch(""); setCart([]); setKitId(""); setVehicleId(""); setMethod("QR"); setError(null);
  };

  async function submit() {
    setError(null);
    if (!soldierId) { setError("בחר חייל"); return; }
    if (cart.length === 0 && !kitId) { setError("הוסף לפחות פריט אחד או בחר ערכה"); return; }
    const fd = new FormData();
    fd.append("soldierId", soldierId);
    fd.append("method", method);
    if (kitId) fd.append("kitId", kitId);
    if (vehicleId) fd.append("vehicleId", vehicleId);
    if (physicalLocation) fd.append("physicalLocation", physicalLocation);
    for (const c of cart) {
      if (c.type === "serial") fd.append("serial", c.unitId);
      else { fd.append("qtyItem", c.itemTypeId); fd.append("qtyValue", String(c.quantity)); fd.append("qtyStatus", c.statusId); }
    }
    try {
      await createSignout(fd);
      reset(); setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium">
        + החתמת חייל
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden">
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
                <option value="">— בחר —</option>
                {filteredSoldiers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.pn}){s.companyName ? ` · ${s.companyName}` : ""}
                  </option>
                ))}
              </select>
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
                      <span className="text-lg">🔫</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{c.itemName}</div>
                        <div className="text-xs text-slate-500 font-mono truncate">SN: {c.serial} · {c.status}</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-lg">📦</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{c.itemName}</div>
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
              {kits.length > 0 && (
                <div>
                  <label className="block text-[11px] text-slate-600 mb-0.5">או — ערכה מוכנה</label>
                  <select value={kitId} onChange={(e) => setKitId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                    <option value="">— ללא —</option>
                    {kits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                  </select>
                  {selectedKit && <p className="text-[11px] text-slate-500 mt-1">{selectedKit.lines.map((l) => `${l.name}×${l.qty}`).join(", ")}</p>}
                </div>
              )}
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
                  {(["QR", "LINK", "ONSITE"] as const).map((m) => (
                    <label key={m} className={`flex-1 text-center px-2 py-1.5 rounded-lg border-2 cursor-pointer transition ${method === m ? "border-slate-800 bg-slate-100" : "border-slate-200"}`}>
                      <input type="radio" checked={method === m} onChange={() => setMethod(m)} className="hidden" />
                      {m === "QR" ? "QR" : m === "LINK" ? "WhatsApp" : "שרבוט"}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* === עמודה שמאלית — מלאי זמין === */}
          <div className="flex flex-col bg-white order-1 md:order-2 min-h-0">
            <div className="p-3 border-b border-slate-200 bg-white sticky top-0 shrink-0">
              <div className="flex items-center gap-2 mb-2">
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
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-2 pb-1 pt-1">סריאלי — לחץ להוספה</div>
                  {availableUnits.map((u) => (
                    <button key={u.id} onClick={() => addSerial(u)}
                      className="w-full text-right bg-white border border-slate-200 rounded-lg p-2 mb-1 hover:bg-blue-50 hover:border-blue-300 transition flex items-center gap-2 group">
                      <span className="text-lg">🔫</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{u.itemName}</div>
                        <div className="text-xs text-slate-500 font-mono truncate">SN: {u.serial} · {u.status}</div>
                      </div>
                      <span className="text-blue-600 font-bold text-lg group-hover:scale-110 transition">+</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="border-t border-slate-200 p-3 bg-white flex items-center justify-between gap-2 shrink-0">
          {error && <div className="flex-1 text-sm text-rose-700 font-medium">⚠️ {error}</div>}
          <div className="flex items-center gap-2 mr-auto">
            <button onClick={() => { reset(); setOpen(false); }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
            <button onClick={submit} disabled={!soldierId || (cart.length === 0 && !kitId)}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg px-5 py-2 text-sm font-bold">
              ✍️ שלח להחתמה ({cart.length}{kitId ? " + ערכה" : ""})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
