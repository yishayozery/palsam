"use client";

import { useState } from "react";
import { importSerials } from "./serial-import";

type Item = { id: string; name: string; sku: string };
type Status = { id: string; name: string };

export default function SerialImport({ items, statuses }: { items: Item[]; statuses: Status[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (items.length === 0) return null;

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="bg-white border border-slate-300 text-slate-700 rounded-lg px-4 py-2 text-sm hover:bg-slate-50">
        📄 טעינת סריאליים מקובץ
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">טעינת פריטים סריאליים מקובץ</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <form action={async (fd) => { setBusy(true); try { await importSerials(fd); } finally { setBusy(false); setOpen(false); } }} className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">פריט (סריאלי)</label>
                <select name="itemTypeId" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">סטטוס</label>
                <select name="statusId" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">קובץ אקסל (עמודה 1 = מספר סריאלי)</label>
                <input type="file" name="file" accept=".xlsx,.xls" required className="w-full text-sm" />
                <a href="/inventory/serials-template" className="text-xs text-blue-600 hover:underline">⬇ הורד תבנית לדוגמה</a>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
                <button disabled={busy} className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-60">{busy ? "טוען..." : "טעינה"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
