"use client";

import { useState, useMemo } from "react";
import { TRACKING_METHOD } from "@/lib/labels";
import { changeUnitsStatus, changeQuantityStatus } from "./actions";

type Item = { id: string; name: string; sku: string | null; trackingMethod: "QUANTITY" | "SERIAL" | "LOT" | "KIT"; unit: string };
type Status = { id: string; name: string; isDefault: boolean; isWear: boolean; isLoss: boolean };
type Stock = { itemTypeId: string; statusId: string; statusName: string; quantity: number };
type SerialUnit = { id: string; itemTypeId: string; serialNumber: string; lotQuantity: number | null; statusId: string; statusName: string };

function statusBadgeColor(s: Status): string {
  if (s.isLoss) return "bg-rose-100 text-rose-700";
  if (s.isWear) return "bg-amber-100 text-amber-700";
  if (s.isDefault) return "bg-emerald-100 text-emerald-700";
  return "bg-slate-100 text-slate-700";
}

export default function StatusChangeModal({ items, statuses, stocks, units }: {
  items: Item[]; statuses: Status[]; stocks: Stock[]; units: SerialUnit[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [itemId, setItemId] = useState("");
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [fromStatusId, setFromStatusId] = useState("");
  const [newStatusId, setNewStatusId] = useState("");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const selected = items.find((i) => i.id === itemId);
  const itemSerials = useMemo(() => units.filter((u) => u.itemTypeId === itemId), [units, itemId]);
  const itemStocks = useMemo(() => stocks.filter((s) => s.itemTypeId === itemId), [stocks, itemId]);
  const fromBalance = itemStocks.find((s) => s.statusId === fromStatusId);

  const filtered = useMemo(() => {
    if (!query.trim()) return items.slice(0, 40);
    const q = query.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q)).slice(0, 40);
  }, [items, query]);

  const reset = () => {
    setItemId(""); setQuery(""); setSelectedUnits([]);
    setFromStatusId(""); setNewStatusId(""); setQty(1); setReason("");
    setError(null);
  };

  async function submitSerial(fd: FormData) {
    setError(null); setOk(null);
    try {
      const result = await changeUnitsStatus(fd);
      setOk(`✓ עודכנו ${result?.changed ?? selectedUnits.length} יחידות`);
      setTimeout(() => { reset(); setOpen(false); setOk(null); }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function submitQty(fd: FormData) {
    setError(null); setOk(null);
    try {
      await changeQuantityStatus(fd);
      setOk(`✓ הועברו ${qty} יחידות לסטטוס חדש`);
      setTimeout(() => { reset(); setOpen(false); setOk(null); }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-3 md:px-5 py-2 md:py-2.5 text-xs md:text-sm font-medium shadow-sm flex items-center gap-2"
        title="סמן יחידות שהתקלקלו / אבדו / התבלו — מעביר אותן לסטטוס אחר בלי לגרוע מהמלאי">
        ⚠️ <span className="hidden sm:inline">סמן תקול / שנה סטטוס</span><span className="sm:hidden">תקולים</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-amber-700 to-amber-900 text-white p-5 rounded-t-2xl flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">⚠️ שינוי סטטוס פריטים</h3>
            <p className="text-xs text-amber-100 mt-0.5">סמן יחידות שהתקלקלו, אבדו, או נשחקו — הסטטוס שלהן ישתנה (הכמות נשארת).</p>
          </div>
          <button onClick={() => { reset(); setOpen(false); }} className="text-amber-100 hover:text-white text-2xl leading-none">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* הסבר התהליך — בולט בראש */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
            💡 <b>שלבי התהליך:</b>
            <ol className="list-decimal list-inside mt-1 space-y-0.5">
              <li>חפש ובחר את הפריט (M4, רימון, אלונקה...)</li>
              <li>בחר אילו יחידות (סריאליים) או כמה (כמותי) — מאיזה סטטוס הן</li>
              <li>בחר את הסטטוס החדש (תקול / בלאי / אבוד / תקין)</li>
              <li>הזן סיבה (אופציונלי) ואשר</li>
            </ol>
          </div>

          {error && <div className="bg-rose-50 border-2 border-rose-300 rounded-lg p-3 text-sm text-rose-800">⚠️ {error}</div>}
          {ok && <div className="bg-emerald-50 border-2 border-emerald-300 rounded-lg p-3 text-sm text-emerald-800">{ok}</div>}

          {/* בחירת פריט */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              <span className="bg-amber-600 text-white rounded-full w-5 h-5 inline-flex items-center justify-center text-xs ml-1.5">1</span>
              בחר פריט
            </label>
            {!selected ? (
              <>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="הקלד שם/מק״ט..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <div className="mt-2 max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {filtered.map((i) => (
                    <button key={i.id} type="button" onClick={() => setItemId(i.id)}
                      className="w-full text-right px-3 py-2 hover:bg-amber-50 flex items-center justify-between text-sm">
                      <span><b>{i.name}</b> {i.sku && <span className="font-mono text-xs text-slate-400">{i.sku}</span>}</span>
                      <span className="text-xs bg-slate-200 rounded-full px-2 py-0.5">{TRACKING_METHOD[i.trackingMethod]}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between">
                <div className="font-bold text-slate-800">{selected.name} {selected.sku && <span className="font-mono text-xs text-slate-500">({selected.sku})</span>}</div>
                <button type="button" onClick={() => { setItemId(""); setSelectedUnits([]); }} className="text-xs text-rose-500 hover:text-rose-700">החלף</button>
              </div>
            )}
          </div>

          {/* === SERIAL === */}
          {selected && (selected.trackingMethod === "SERIAL" || selected.trackingMethod === "LOT") && (
            <form action={submitSerial} className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  <span className="bg-amber-600 text-white rounded-full w-5 h-5 inline-flex items-center justify-center text-xs ml-1.5">2</span>
                  בחר יחידות לשינוי סטטוס ({selectedUnits.length}/{itemSerials.length})
                </label>
                {itemSerials.length === 0 ? (
                  <p className="text-sm text-slate-400 p-3 bg-slate-50 rounded-lg text-center">אין יחידות סריאליות במלאי</p>
                ) : (
                  <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {itemSerials.map((u) => {
                      const checked = selectedUnits.includes(u.id);
                      return (
                        <label key={u.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 cursor-pointer text-sm">
                          <input type="checkbox" name="unitId" value={u.id} checked={checked}
                            onChange={(e) => setSelectedUnits((p) => e.target.checked ? [...p, u.id] : p.filter((id) => id !== u.id))}
                            className="w-4 h-4" />
                          <span className="font-mono flex-1">{u.serialNumber}</span>
                          {u.lotQuantity && <span className="text-xs text-slate-500">×{u.lotQuantity}</span>}
                          <span className="text-xs text-slate-500">[{u.statusName}]</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  <span className="bg-amber-600 text-white rounded-full w-5 h-5 inline-flex items-center justify-center text-xs ml-1.5">3</span>
                  סטטוס חדש
                </label>
                <div className="flex gap-2 flex-wrap">
                  {statuses.map((s) => (
                    <label key={s.id} className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 cursor-pointer transition ${newStatusId === s.id ? "border-amber-500 ring-2 ring-amber-200" : "border-transparent"} ${statusBadgeColor(s)}`}>
                      <input type="radio" name="newStatusId" value={s.id} checked={newStatusId === s.id}
                        onChange={() => setNewStatusId(s.id)} className="hidden" />
                      {s.name}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">סיבה (אופציונלי)</label>
                <input name="reason" value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="למשל: נשק נפל ונשבר; קסדה התבלתה"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => { reset(); setOpen(false); }} className="rounded-lg border border-slate-300 px-5 py-2 text-sm">ביטול</button>
                <button disabled={selectedUnits.length === 0 || !newStatusId}
                  className="bg-amber-600 disabled:opacity-50 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-amber-700">
                  עדכן {selectedUnits.length} יחידות
                </button>
              </div>
            </form>
          )}

          {/* === QUANTITY === */}
          {selected && selected.trackingMethod === "QUANTITY" && (
            <form action={submitQty} className="space-y-3">
              <input type="hidden" name="itemTypeId" value={itemId} />
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  <span className="bg-amber-600 text-white rounded-full w-5 h-5 inline-flex items-center justify-center text-xs ml-1.5">2</span>
                  בחר מאיזה סטטוס לקחת
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {itemStocks.length === 0 ? (
                    <p className="text-sm text-slate-400 p-3 bg-slate-50 rounded-lg col-span-2 text-center">אין מלאי כמותי לפריט</p>
                  ) : itemStocks.map((s) => {
                    const sd = statuses.find((st) => st.id === s.statusId);
                    return (
                      <label key={s.statusId} className={`p-3 rounded-lg border-2 cursor-pointer ${fromStatusId === s.statusId ? "border-amber-500 bg-amber-50" : "border-slate-200"}`}>
                        <input type="radio" name="fromStatusId" value={s.statusId} checked={fromStatusId === s.statusId}
                          onChange={() => setFromStatusId(s.statusId)} className="hidden" />
                        <div className="text-xs text-slate-500">{s.statusName}{sd?.isWear && " (בלאי)"}{sd?.isLoss && " (אבוד)"}</div>
                        <div className="text-2xl font-bold">{s.quantity}</div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {fromStatusId && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      <span className="bg-amber-600 text-white rounded-full w-5 h-5 inline-flex items-center justify-center text-xs ml-1.5">3</span>
                      סטטוס חדש
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {statuses.filter((s) => s.id !== fromStatusId).map((s) => (
                        <label key={s.id} className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 cursor-pointer ${newStatusId === s.id ? "border-amber-500 ring-2 ring-amber-200" : "border-transparent"} ${statusBadgeColor(s)}`}>
                          <input type="radio" name="newStatusId" value={s.id} checked={newStatusId === s.id}
                            onChange={() => setNewStatusId(s.id)} className="hidden" />
                          {s.name}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      <span className="bg-amber-600 text-white rounded-full w-5 h-5 inline-flex items-center justify-center text-xs ml-1.5">4</span>
                      כמות להעביר (זמין: {fromBalance?.quantity ?? 0})
                    </label>
                    <input type="number" name="quantity" min={1} max={fromBalance?.quantity ?? 1}
                      value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 1)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-lg font-bold" autoFocus />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">סיבה (אופציונלי)</label>
                    <input name="reason" value={reason} onChange={(e) => setReason(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                    <button type="button" onClick={() => { reset(); setOpen(false); }} className="rounded-lg border border-slate-300 px-5 py-2 text-sm">ביטול</button>
                    <button disabled={!newStatusId || qty < 1 || qty > (fromBalance?.quantity ?? 0)}
                      className="bg-amber-600 disabled:opacity-50 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-amber-700">
                      העבר {qty} יחידות
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
