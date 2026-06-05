"use client";

import { useState, useMemo } from "react";
import { createSignout } from "./actions";

type Soldier = { id: string; name: string; pn: string; companyId?: string | null; companyName?: string | null };
type Company = { id: string; name: string };
type Unit = { id: string; name: string; serial: string; holder: string; status: string };
type Kit = { id: string; name: string; lines: { name: string; qty: number }[] };
type Vehicle = { id: string; name: string; plate: string };

export default function SignoutModal({
  soldiers, companies = [], units, kits, vehicles, lockCompanyId,
}: {
  soldiers: Soldier[]; companies?: Company[]; units: Unit[]; kits: Kit[]; vehicles: Vehicle[];
  lockCompanyId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [kitId, setKitId] = useState("");
  const [companyFilter, setCompanyFilter] = useState(lockCompanyId ?? "");
  const [search, setSearch] = useState("");
  const selectedKit = kits.find((k) => k.id === kitId);

  const filteredSoldiers = useMemo(() => {
    return soldiers.filter((s) => {
      if (companyFilter && s.companyId !== companyFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return s.name.toLowerCase().includes(q) || s.pn.includes(q);
      }
      return true;
    }).slice(0, 200);
  }, [soldiers, companyFilter, search]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-900"
      >
        + החתמת חייל
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">החתמת חייל על ציוד</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <form action={async (fd) => { await createSignout(fd); setOpen(false); }} className="p-5 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                <label className="block text-sm font-semibold text-slate-700">חייל לחתימה</label>
                {!lockCompanyId && companies.length > 0 && (
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">סינון לפי פלוגה</label>
                    <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                      <option value="">כל הפלוגות ({soldiers.length} חיילים)</option>
                      {companies.map((c) => {
                        const cnt = soldiers.filter((s) => s.companyId === c.id).length;
                        return <option key={c.id} value={c.id}>{c.name} ({cnt})</option>;
                      })}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs text-slate-500 mb-1">חיפוש לפי שם / מ.א.</label>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="הקלד..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">בחר חייל ({filteredSoldiers.length} מתאימים)</label>
                  <select name="soldierId" required size={Math.min(6, Math.max(3, filteredSoldiers.length))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                    {filteredSoldiers.length === 0 && <option value="" disabled>אין חיילים מתאימים</option>}
                    {filteredSoldiers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.pn}){s.companyName ? ` · ${s.companyName}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">אופן החתמה</label>
                <div className="flex gap-3 text-sm">
                  <label className="flex items-center gap-1.5"><input type="radio" name="method" value="QR" defaultChecked /> קוד QR</label>
                  <label className="flex items-center gap-1.5"><input type="radio" name="method" value="LINK" /> וואטסאפ</label>
                  <label className="flex items-center gap-1.5"><input type="radio" name="method" value="ONSITE" /> שרבוט</label>
                </div>
              </div>

              {kits.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ערכת החתמה (אופציונלי)</label>
                  <select name="kitId" value={kitId} onChange={(e) => setKitId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="">— ללא ערכה —</option>
                    {kits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                  </select>
                  {selectedKit && (
                    <p className="text-xs text-slate-500 mt-1">
                      תכולה: {selectedKit.lines.map((l) => `${l.name}×${l.qty}`).join(", ")}
                    </p>
                  )}
                </div>
              )}

              {vehicles.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">מיקום ברכב (אופציונלי)</label>
                  <select name="vehicleId"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="">— ללא רכב —</option>
                    {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} {v.plate}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  פריטים פרטניים להחתמה ({units.length} זמינים)
                </label>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {units.length === 0 && (
                    <p className="text-sm text-slate-400 p-3">אין פריטים זמינים</p>
                  )}
                  {units.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm px-3 py-2 hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" name="serial" value={u.id} className="w-4 h-4" />
                      <span className="font-medium">{u.name}</span>
                      <span className="font-mono text-xs text-slate-500">{u.serial}</span>
                      <span className="text-xs text-slate-400 mr-auto">{u.holder} · {u.status}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
                <button className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm">
                  יצירת החתמה
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
