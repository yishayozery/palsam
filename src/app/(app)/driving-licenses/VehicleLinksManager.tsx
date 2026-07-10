"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveVehicleLink, deleteVehicleLink } from "./vehicle-actions";

type Link = { id: string; name: string; url: string; visibleToSoldier: boolean };

export default function VehicleLinksManager({ links }: { links: Link[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState<Link | "new" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function submit(fd: FormData) {
    setErr(null);
    start(async () => {
      const r = await saveVehicleLink(fd);
      if (r?.error) { setErr(r.error); return; }
      setEdit(null);
      router.refresh();
    });
  }

  const row = edit === "new" ? null : edit;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-700 text-sm">🔗 קישורים שימושיים (מוצגים לחייל בבוט לפי שם)</h3>
        {!edit && <button onClick={() => { setErr(null); setEdit("new"); }} className="text-sm bg-slate-800 text-white rounded-lg px-3 py-1.5 hover:bg-slate-900">➕ קישור</button>}
      </div>

      {edit && (
        <form action={submit} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
          {row && <input type="hidden" name="id" value={row.id} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">שם הקישור (מוצג)</label>
              <input name="name" required defaultValue={row?.name || ""} placeholder="תקלות מוסך" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">הלינק (שתול)</label>
              <input name="url" required defaultValue={row?.url || ""} placeholder="https://…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" dir="ltr" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="visibleToSoldier" defaultChecked={row ? row.visibleToSoldier : true} className="w-4 h-4 rounded accent-sky-600" />
            👁️ מוצג לחייל בבוט (בטל אם רק לקצין רכב)
          </label>
          {err && <p className="text-rose-600 text-sm">{err}</p>}
          <div className="flex gap-2">
            <button disabled={pending} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">{pending ? "…" : "שמור"}</button>
            <button type="button" onClick={() => setEdit(null)} className="border border-slate-300 rounded-lg px-4 py-2 text-sm">ביטול</button>
          </div>
        </form>
      )}

      {links.length === 0 ? <p className="text-slate-400 text-sm">אין קישורים עדיין.</p> : (
        <div className="space-y-2">
          {links.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2 border border-slate-200 rounded-xl px-3 py-2">
              <div className="min-w-0">
                <div className="font-medium text-slate-800 text-sm">{l.visibleToSoldier ? "👁️" : "🔒"} {l.name}</div>
                <a href={l.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline font-mono truncate block" dir="ltr">{l.url}</a>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => { setErr(null); setEdit(l); }} className="text-xs text-slate-500 hover:text-slate-800">✏️ ערוך</button>
                <button onClick={() => { if (confirm(`למחוק את "${l.name}"?`)) start(async () => { await deleteVehicleLink(l.id); router.refresh(); }); }} disabled={pending} className="text-xs text-rose-400 hover:text-rose-600">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
