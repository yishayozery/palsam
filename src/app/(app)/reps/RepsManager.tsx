"use client";

import { useState } from "react";
import { saveRep, copyFromWarehouse } from "./actions";

type Ref = { id: string; name: string };
type Rep = { id: string; name: string; companyId: string | null };

export default function RepsManager({
  companies,
  reps,
  otherWarehouses,
}: {
  companies: Ref[];
  reps: Rep[];
  otherWarehouses: Ref[];
}) {
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState(companies[0]?.id || "");
  const companyReps = reps.filter((r) => r.companyId === companyId);

  return (
    <div className="flex gap-2">
      {otherWarehouses.length > 0 && (
        <form action={copyFromWarehouse} className="flex items-center gap-1">
          <select name="sourceWarehouseId" className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
            {otherWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <button className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">העתק ממחסן</button>
        </form>
      )}
      <button onClick={() => setOpen(true)} className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-900">+ פלוגה</button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">הוספת פלוגה ונציג</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <form action={async (fd) => { await saveRep(fd); setOpen(false); }} className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">פלוגה</label>
                <select name="companyId" value={companyId} onChange={(e) => setCompanyId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">נציג (אופציונלי)</label>
                <select name="repUserId" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="">— ללא —</option>
                  {companyReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                {companyReps.length === 0 && <p className="text-xs text-amber-600 mt-1">אין נציגים לפלוגה זו. צור משתמש נציג במסך משתמשים.</p>}
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
                <button className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm">הוספה</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
