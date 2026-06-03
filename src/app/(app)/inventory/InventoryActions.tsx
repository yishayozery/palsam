"use client";

import { useState } from "react";
import { intakeStock, writeOffStock } from "./actions";

type ItemRef = { id: string; name: string; sku: string; trackingMethod: string };
type StatusRef = { id: string; name: string };

export default function InventoryActions({
  items,
  statuses,
}: {
  items: ItemRef[];
  statuses: StatusRef[];
}) {
  const [mode, setMode] = useState<null | "intake" | "writeoff">(null);
  const [itemId, setItemId] = useState(items[0]?.id || "");
  const item = items.find((i) => i.id === itemId);

  return (
    <>
      <div className="flex gap-2">
        <button onClick={() => { setMode("intake"); }}
          className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-emerald-700">
          + קליטת מלאי
        </button>
        <button onClick={() => { setMode("writeoff"); }}
          className="bg-white border border-rose-300 text-rose-600 rounded-lg px-4 py-2 text-sm hover:bg-rose-50">
          גריעת מלאי
        </button>
      </div>

      {mode && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">
                {mode === "intake" ? "קליטת מלאי חדש (מהחטיבה)" : "גריעת מלאי (לחטיבה)"}
              </h3>
              <button onClick={() => setMode(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <form
              action={async (fd) => {
                if (mode === "intake") await intakeStock(fd);
                else await writeOffStock(fd);
                setMode(null);
              }}
              className="p-5 space-y-4"
            >
              <div>
                <label className="block text-xs text-slate-500 mb-1">פריט</label>
                <select name="itemTypeId" value={itemId} onChange={(e) => setItemId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>
                  ))}
                </select>
              </div>

              {item?.trackingMethod === "QUANTITY" && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">כמות</label>
                  <input name="quantity" type="number" min="1" defaultValue="1"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
              )}

              {item?.trackingMethod === "SERIAL" && mode === "intake" && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">מספרים סריאליים (שורה לכל פריט)</label>
                  <textarea name="serials" rows={4} placeholder="M4-3001&#10;M4-3002"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
                </div>
              )}

              {item?.trackingMethod === "LOT" && mode === "intake" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">מספר אצווה</label>
                    <input name="lotNumber" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">כמות באצווה</label>
                    <input name="quantity" type="number" min="1" defaultValue="1"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-slate-500 mb-1">סטטוס</label>
                <select name="statusId" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  {mode === "intake" ? "הערה" : "סיבת הגריעה"}
                </label>
                <input name="reason" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>

              {mode === "writeoff" && item?.trackingMethod !== "QUANTITY" && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
                  לגריעת פריט סריאלי/אצווה ספציפי — בצע מתוך טבלת המלאי.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setMode(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
                <button className={`text-white rounded-lg px-4 py-2 text-sm ${mode === "intake" ? "bg-emerald-600" : "bg-rose-600"}`}>
                  {mode === "intake" ? "קליטה" : "גריעה"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
