"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui";
import { TRACKING_METHOD } from "@/lib/labels";
import { createReturn } from "./actions";

type Item = { id: string; name: string; sku: string | null; trackingMethod: "QUANTITY" | "SERIAL" | "LOT" | "KIT" };
type SerialUnit = { id: string; itemTypeId: string; serialNumber: string; lotQuantity: number | null; statusName: string };
type Balance = { itemTypeId: string; statusId: string; statusName: string; quantity: number };
type Status = { id: string; name: string; isDefault: boolean };

export default function ReturnForm({ items, serialUnits, balances, statuses }: {
  items: Item[]; serialUnits: SerialUnit[]; balances: Balance[]; statuses: Status[];
}) {
  const [query, setQuery] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [statusId, setStatusId] = useState(statuses.find((s) => s.isDefault)?.id ?? statuses[0]?.id ?? "");
  const [selectedSerials, setSelectedSerials] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const selected = items.find((i) => i.id === itemId);
  const filtered = useMemo(() => {
    if (!query.trim()) return items.slice(0, 30);
    const q = query.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q)).slice(0, 30);
  }, [items, query]);

  const availableSerials = serialUnits.filter((u) => u.itemTypeId === itemId);
  const availableBalances = balances.filter((b) => b.itemTypeId === itemId);
  const totalAvailable = selected?.trackingMethod === "QUANTITY"
    ? availableBalances.filter((b) => b.statusId === statusId).reduce((s, b) => s + b.quantity, 0)
    : availableSerials.length;

  const reset = () => {
    setItemId(""); setQuery(""); setQuantity(1); setSelectedSerials([]); setNotes("");
  };

  async function submit(fd: FormData) {
    setError(null); setOk(false);
    try {
      await createReturn(fd);
      setOk(true);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Card className="p-5">
      <h2 className="font-bold text-slate-800 mb-4">בקשת זיכוי חדשה</h2>

      {ok && <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-3 text-sm text-emerald-800">✓ הבקשה נשלחה. ממתין לאישור קצין המחסן.</div>}
      {error && <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 mb-3 text-sm text-rose-700">{error}</div>}

      <form action={submit} className="space-y-4">
        {/* בחירת פריט */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">פריט לזיכוי</label>
          {!selected ? (
            <>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="הקלד שם/מק״ט..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <div className="mt-2 max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <p className="text-sm text-slate-400 p-3 text-center">אין פריטים זמינים לזיכוי</p>
                ) : filtered.map((i) => (
                  <button key={i.id} type="button" onClick={() => setItemId(i.id)}
                    className="w-full text-right px-3 py-2 hover:bg-blue-50 flex items-center justify-between text-sm">
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
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-800">{selected.name} {selected.sku && <span className="font-mono text-xs text-slate-500">({selected.sku})</span>}</div>
                <div className="text-xs text-slate-500">זמין לזיכוי: <b>{totalAvailable}</b></div>
              </div>
              <button type="button" onClick={() => { setItemId(""); setSelectedSerials([]); }}
                className="text-xs text-rose-500 hover:text-rose-700">החלף</button>
            </div>
          )}
        </div>

        {selected && (
          <>
            <input type="hidden" name="itemTypeId" value={itemId} />

            {selected.trackingMethod === "QUANTITY" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">סטטוס</label>
                  <select name="statusId" value={statusId} onChange={(e) => setStatusId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    כמות (זמין: {totalAvailable})
                  </label>
                  <input type="number" name="quantity" min={1} max={totalAvailable} value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
              </div>
            )}

            {(selected.trackingMethod === "SERIAL" || selected.trackingMethod === "LOT") && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  בחר יחידות לזיכוי ({selectedSerials.length} נבחרו מתוך {availableSerials.length})
                </label>
                {availableSerials.length === 0 ? (
                  <p className="text-sm text-slate-400 p-3 bg-slate-50 rounded-lg text-center">אין יחידות זמינות (כולן חתומות על חיילים)</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {availableSerials.map((u) => {
                      const checked = selectedSerials.includes(u.id);
                      return (
                        <label key={u.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 cursor-pointer text-sm">
                          <input type="checkbox" name="serialId" value={u.id} checked={checked}
                            onChange={(e) => {
                              setSelectedSerials((prev) => e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id));
                            }}
                            className="w-4 h-4" />
                          <span className="font-mono">{u.serialNumber}</span>
                          {u.lotQuantity && <span className="text-xs text-slate-500">×{u.lotQuantity}</span>}
                          <span className="ml-auto text-xs text-slate-500">{u.statusName}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">הערות (אופציונלי)</label>
              <textarea name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                placeholder="סיבת הזיכוי, מצב הציוד וכו'"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button type="button" onClick={reset} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">ביטול</button>
              <button
                disabled={
                  (selected.trackingMethod === "QUANTITY" && (quantity < 1 || quantity > totalAvailable)) ||
                  ((selected.trackingMethod === "SERIAL" || selected.trackingMethod === "LOT") && selectedSerials.length === 0)
                }
                className="bg-amber-600 disabled:opacity-50 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-amber-700">
                ↩️ שלח לאישור קצין מחסן
              </button>
            </div>
          </>
        )}
      </form>
    </Card>
  );
}
