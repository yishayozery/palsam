"use client";

import { useState } from "react";
import { createCompanySign } from "./company-actions";

type Company = { id: string; name: string; members: { id: string; name: string; role: string }[] };
type Unit = { id: string; name: string; serial: string; status: string; statusId: string };
type Balance = { itemTypeId: string; statusId: string; name: string; unit: string; status: string; quantity: number };

export default function CompanySignModal({
  companies, units, balances,
}: { companies: Company[]; units: Unit[]; balances: Balance[]; }) {
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const selectedCompany = companies.find((c) => c.id === companyId);

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm hover:bg-emerald-800">
        + החתמת פלוגה
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">החתמת פלוגה</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <form action={async (fd) => { await createCompanySign(fd); setOpen(false); }} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">פלוגה מקבלת</label>
                  <select name="companyId" value={companyId} onChange={(e) => setCompanyId(e.target.value)} required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">נמען (חותם)</label>
                  <select name="recipientUserId" required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {selectedCompany?.members.length === 0
                      ? <option value="">— אין משתמשים בפלוגה —</option>
                      : selectedCompany?.members.map((m) => (
                          <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
                        ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">אופן חתימה</label>
                <div className="flex gap-3 text-sm">
                  <label className="flex items-center gap-1.5"><input type="radio" name="method" value="QR" defaultChecked /> קוד QR</label>
                  <label className="flex items-center gap-1.5"><input type="radio" name="method" value="LINK" /> וואטסאפ</label>
                  <label className="flex items-center gap-1.5"><input type="radio" name="method" value="ONSITE" /> שרבוט</label>
                </div>
              </div>

              {balances.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">מלאי כמותי</label>
                  <div className="space-y-1 max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2">
                    {balances.map((b) => (
                      <div key={`${b.itemTypeId}:${b.statusId}`} className="flex items-center justify-between text-sm py-1">
                        <span>{b.name} <span className="text-slate-400">({b.status}) · יש: {b.quantity} {b.unit}</span></span>
                        <input type="number" min="0" max={b.quantity} defaultValue="0"
                          name={`qty:${b.itemTypeId}:${b.statusId}`}
                          className="w-20 rounded border border-slate-300 px-2 py-1 text-sm" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {units.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">פריטים סריאליים</label>
                  <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {units.map((u) => (
                      <label key={u.id} className="flex items-center gap-2 text-sm px-3 py-2 hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" name="serial" value={u.id} className="w-4 h-4" />
                        <span className="font-medium">{u.name}</span>
                        <span className="font-mono text-xs text-slate-500">{u.serial}</span>
                        <span className="text-xs text-slate-400 mr-auto">{u.status}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
                <button className="bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm">יצירת קישור חתימה</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
