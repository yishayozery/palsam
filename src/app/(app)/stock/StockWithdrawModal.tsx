"use client";

import { useState, useMemo } from "react";
import { TRACKING_METHOD } from "@/lib/labels";
import { withdrawQty, withdrawSerials } from "./actions";

type Item = {
  id: string; name: string; sku: string | null;
  trackingMethod: "QUANTITY" | "SERIAL" | "LOT" | "KIT";
  unit: string;
};
type Status = { id: string; name: string; isDefault: boolean };
type Stock = { itemTypeId: string; statusId: string; statusName: string; quantity: number };
type SerialUnit = { id: string; itemTypeId: string; serialNumber: string; lotQuantity: number | null; statusName: string };

type CounterpartOption = { value: string; label: string };
export default function StockWithdrawModal({
  items, statuses, currentUserName, stocks, units, requirePersonalId, counterpartOptions = [],
}: {
  items: Item[]; statuses: Status[]; currentUserName: string;
  stocks: Stock[]; units: SerialUnit[]; requirePersonalId: boolean;
  counterpartOptions?: CounterpartOption[];
}) {
  const [open, setOpen] = useState(false);
  const [itemQuery, setItemQuery] = useState("");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState<number>(1);
  const defaultStatus = statuses.find((s) => s.isDefault)?.id ?? statuses[0]?.id ?? "";
  const [statusId, setStatusId] = useState(defaultStatus);
  const [externalUnit, setExternalUnit] = useState("חטיבה");
  const [externalContact, setExternalContact] = useState("");
  const [recipientPersonalId, setRecipientPersonalId] = useState("");
  const [selectedSerials, setSelectedSerials] = useState<string[]>([]);
  const [allowNegative, setAllowNegative] = useState(false);

  const selected = items.find((i) => i.id === itemId);
  const filteredItems = useMemo(() => {
    if (!itemQuery.trim()) return items.slice(0, 50);
    const q = itemQuery.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q)).slice(0, 50);
  }, [items, itemQuery]);

  // כמות זמינה לפריט+סטטוס
  const available = useMemo(() => {
    if (!selected) return 0;
    if (selected.trackingMethod === "QUANTITY") {
      return stocks.filter((s) => s.itemTypeId === itemId && s.statusId === statusId).reduce((a, b) => a + b.quantity, 0);
    }
    return units.filter((u) => u.itemTypeId === itemId).length;
  }, [selected, itemId, statusId, stocks, units]);

  const isOverdraft = selected?.trackingMethod === "QUANTITY" && qty > available;

  const itemUnits = units.filter((u) => u.itemTypeId === itemId);

  const reset = () => {
    setItemId(""); setItemQuery(""); setQty(1); setStatusId(defaultStatus);
    setExternalContact(""); setSelectedSerials([]); setAllowNegative(false);
  };

  return (
    <>
      <button onClick={() => { reset(); setOpen(true); }}
        className="bg-rose-600 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-rose-700 shadow-sm flex items-center gap-2">
        <span className="text-lg leading-none">−</span> הורדת מלאי
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-rose-700 to-rose-900 text-white p-5 rounded-t-2xl flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">הורדת מלאי / העברה מחוץ לגדוד</h3>
                <p className="text-xs text-rose-100 mt-0.5">ניפוק לחטיבה / יחידה אחרת</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-rose-100 hover:text-white text-2xl leading-none">✕</button>
            </div>

            <div className="p-6 space-y-5">
              {/* בחירת פריט */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">פריט להוצאה</label>
                {!selected ? (
                  <>
                    <input autoFocus value={itemQuery} onChange={(e) => setItemQuery(e.target.value)}
                      placeholder="הקלד שם או מק״ט..."
                      className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm" />
                    <div className="mt-2 max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-slate-50">
                      {filteredItems.map((i) => (
                        <button key={i.id} type="button" onClick={() => setItemId(i.id)}
                          className="w-full text-right px-4 py-2.5 hover:bg-rose-50 flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2">
                            <span className="font-medium">{i.name}</span>
                            {i.sku && <span className="font-mono text-xs text-slate-400">{i.sku}</span>}
                          </span>
                          <span className="text-xs bg-slate-200 text-slate-700 rounded-full px-2 py-0.5">{TRACKING_METHOD[i.trackingMethod]}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📤</span>
                      <div>
                        <div className="font-bold text-slate-800">{selected.name}</div>
                        <div className="text-xs text-slate-500">
                          {selected.sku && <span className="font-mono">{selected.sku} · </span>}
                          {TRACKING_METHOD[selected.trackingMethod]} · יחידה: {selected.unit}
                        </div>
                      </div>
                    </div>
                    <button type="button" onClick={() => setItemId("")}
                      className="text-xs text-rose-600 hover:text-rose-800">החלף פריט</button>
                  </div>
                )}
              </div>

              {selected && (
                <>
                  {/* סטטוס + כמות */}
                  {selected.trackingMethod === "QUANTITY" && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">סטטוס</label>
                          <select value={statusId} onChange={(e) => setStatusId(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm">
                            {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                            כמות להוצאה <span className="text-xs text-slate-500">(יש: {available})</span>
                          </label>
                          <input type="number" min={1} value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 0)}
                            className={`w-full rounded-lg border px-4 py-2.5 text-sm ${isOverdraft ? "border-amber-400 bg-amber-50" : "border-slate-300"}`} />
                        </div>
                      </div>
                      {isOverdraft && (
                        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 space-y-2">
                          <p className="text-sm text-amber-900">
                            ⚠️ מנפק יותר ממה שיש לך במלאי (חוסר של {qty - available} יחידות).
                          </p>
                          <label className="flex items-center gap-2 text-sm text-amber-900">
                            <input type="checkbox" checked={allowNegative} onChange={(e) => setAllowNegative(e.target.checked)} className="w-4 h-4" />
                            אני מאשר/ת — סמן כ"חוב לחטיבה" (היתרה תרד למינוס)
                          </label>
                        </div>
                      )}
                    </>
                  )}

                  {/* סריאלי - בחירת יחידות */}
                  {(selected.trackingMethod === "SERIAL" || selected.trackingMethod === "LOT") && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                        בחר יחידות להוצאה ({selectedSerials.length} נבחרו / {itemUnits.length} זמינים)
                      </label>
                      <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                        {itemUnits.length === 0 ? (
                          <p className="text-sm text-slate-400 p-3 text-center">אין יחידות במלאי</p>
                        ) : itemUnits.map((u) => (
                          <label key={u.id} className="flex items-center gap-2 text-sm px-3 py-2 hover:bg-slate-50 cursor-pointer">
                            <input type="checkbox" checked={selectedSerials.includes(u.id)}
                              onChange={(e) => setSelectedSerials((prev) => e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id))}
                              className="w-4 h-4" />
                            <span className="font-mono text-xs">{u.serialNumber}</span>
                            {u.lotQuantity && <span className="text-xs text-slate-400">×{u.lotQuantity}</span>}
                            <span className="text-xs text-slate-400 mr-auto">{u.statusName}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* יחידה מקבלת + שם */}
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 space-y-2">
                    <h4 className="text-sm font-semibold text-rose-900">פרטי ההעברה (מי מנפק / מי מקבל)</h4>
                    <p className="text-xs text-slate-600">המנפק: <span className="font-medium text-slate-800">{currentUserName}</span> (אתה)</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">יחידה מקבלת</label>
                        {counterpartOptions.length > 0 ? (
                          <>
                            <select
                              value={counterpartOptions.find((o) => o.value === externalUnit) ? externalUnit : "__manual__"}
                              onChange={(e) => { if (e.target.value !== "__manual__") setExternalUnit(e.target.value); else setExternalUnit(""); }}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white mb-1">
                              {counterpartOptions.map((o) => <option key={o.value || "manual"} value={o.value || "__manual__"}>{o.label}</option>)}
                            </select>
                            <input value={externalUnit} onChange={(e) => setExternalUnit(e.target.value)} placeholder="או הקלד ידנית..."
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          </>
                        ) : (
                          <input value={externalUnit} onChange={(e) => setExternalUnit(e.target.value)} placeholder="חטיבה / יחידה אחרת"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">שם המקבל</label>
                        <input value={externalContact} onChange={(e) => setExternalContact(e.target.value)} placeholder="שם הקצין"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                      </div>
                    </div>
                    {requirePersonalId && (
                      <div className="bg-white border border-rose-300 rounded-lg p-2 mt-2">
                        <label className="block text-xs font-bold text-rose-900 mb-1">
                          🔒 מספר אישי של המקבל (חובה לפי הגדרות הגדוד)
                        </label>
                        <input
                          value={recipientPersonalId}
                          onChange={(e) => setRecipientPersonalId(e.target.value.replace(/\D/g, ""))}
                          placeholder="לדוגמה: 1234567"
                          inputMode="numeric"
                          pattern="\d*"
                          required
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                        />
                      </div>
                    )}
                  </div>

                  {/* כפתורי שליחה */}
                  <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-200">
                    <button type="button" onClick={() => setOpen(false)}
                      className="rounded-lg border border-slate-300 px-5 py-2 text-sm hover:bg-slate-50">ביטול</button>
                    {selected.trackingMethod === "QUANTITY" && (
                      <form action={async (fd) => { await withdrawQty(fd); reset(); setOpen(false); }}>
                        <input type="hidden" name="itemTypeId" value={itemId} />
                        <input type="hidden" name="quantity" value={qty} />
                        <input type="hidden" name="statusId" value={statusId} />
                        <input type="hidden" name="externalUnit" value={externalUnit} />
                        <input type="hidden" name="externalContact" value={externalContact} />
                        <input type="hidden" name="recipientPersonalId" value={recipientPersonalId} />
                        {allowNegative && <input type="hidden" name="allowNegative" value="on" />}
                        <button disabled={qty < 1 || (isOverdraft && !allowNegative)}
                          className="bg-rose-600 text-white rounded-lg px-5 py-2 text-sm hover:bg-rose-700 disabled:opacity-50">
                          הורד {qty} מהמלאי
                        </button>
                      </form>
                    )}
                    {(selected.trackingMethod === "SERIAL" || selected.trackingMethod === "LOT") && (
                      <form action={async (fd) => { await withdrawSerials(fd); reset(); setOpen(false); }}>
                        <input type="hidden" name="itemTypeId" value={itemId} />
                        {selectedSerials.map((id) => <input key={id} type="hidden" name="serialId" value={id} />)}
                        <input type="hidden" name="externalUnit" value={externalUnit} />
                        <input type="hidden" name="externalContact" value={externalContact} />
                        <input type="hidden" name="recipientPersonalId" value={recipientPersonalId} />
                        <button disabled={selectedSerials.length === 0}
                          className="bg-rose-600 text-white rounded-lg px-5 py-2 text-sm hover:bg-rose-700 disabled:opacity-50">
                          הורד {selectedSerials.length} יחידות
                        </button>
                      </form>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
