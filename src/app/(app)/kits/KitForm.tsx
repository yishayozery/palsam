"use client";

import { useState } from "react";
import { saveKit } from "./actions";

type Item = { id: string; name: string; sku: string };
type EditData = { id: string; name: string; lines: { itemTypeId: string; quantity: number }[] };

export default function KitForm({ items, edit }: { items: Item[]; edit?: EditData }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<{ itemTypeId: string; quantity: number }[]>(
    edit?.lines ?? [{ itemTypeId: items[0]?.id ?? "", quantity: 1 }],
  );

  const addLine = () => setLines((ls) => [...ls, { itemTypeId: items[0]?.id ?? "", quantity: 1 }]);
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));
  const updateLine = (i: number, patch: Partial<{ itemTypeId: string; quantity: number }>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={edit ? "text-xs text-slate-500 hover:text-slate-800" : "bg-slate-800 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-900"}
      >
        {edit ? "עריכה" : "+ ערכה חדשה"}
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">{edit ? `עריכת ${edit.name}` : "ערכת החתמה חדשה"}</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <form action={async (fd) => { await saveKit(fd); setOpen(false); }} className="p-5 space-y-4">
              {edit && <input type="hidden" name="id" value={edit.id} />}
              <div>
                <label className="block text-xs text-slate-500 mb-1">שם הערכה</label>
                <input name="name" defaultValue={edit?.name} required placeholder='לדוגמה: ערכת לוחם'
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">תכולת הערכה</label>
                <div className="space-y-2">
                  {lines.map((l, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select
                        name="itemTypeId" value={l.itemTypeId}
                        onChange={(e) => updateLine(i, { itemTypeId: e.target.value })}
                        className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      >
                        {items.map((it) => <option key={it.id} value={it.id}>{it.name}{it.sku && ` (${it.sku})`}</option>)}
                      </select>
                      <input
                        type="number" name="quantity" min="1" value={l.quantity}
                        onChange={(e) => updateLine(i, { quantity: parseInt(e.target.value) || 1 })}
                        className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <button type="button" onClick={() => removeLine(i)}
                        className="text-rose-500 text-sm">✕</button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addLine} className="mt-2 text-xs text-blue-600 hover:underline">+ הוסף פריט</button>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
                <button className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm">שמירה</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
