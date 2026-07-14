"use client";

import { useState, useTransition } from "react";
import { PageHeader, Card } from "@/components/ui";
import { createArmoryInspection, deleteArmoryInspection, addArmoryChecklistItem, toggleArmoryChecklistItem } from "./actions";

type Inspection = {
  id: string; scheduledAt: string; inspectorName: string; holderName: string;
  status: string; overallOk: boolean | null; completedAt: string | null; total: number; faults: number; link: string;
};

export default function InspectionsClient({ inspections, checklist, soldiers, armories }: {
  inspections: Inspection[];
  checklist: { id: string; label: string; active: boolean }[];
  soldiers: { id: string; fullName: string }[];
  armories: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  const [showSettings, setShowSettings] = useState(false);
  const [showNew, setShowNew] = useState(inspections.length === 0);
  const [newLabel, setNewLabel] = useState("");

  const submitNew = (fd: FormData) => start(async () => {
    const res = await createArmoryInspection(fd);
    if (res.error) alert(res.error);
    else setShowNew(false);
  });

  const statusBadge = (i: Inspection) => {
    if (i.status !== "COMPLETED") return <span className="text-xs rounded-full px-2 py-0.5 bg-slate-100 text-slate-600">מתוכנן</span>;
    if (i.overallOk) return <span className="text-xs rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-700">✅ תקין</span>;
    return <span className="text-xs rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">⚠️ {i.faults} ליקויים</span>;
  };

  return (
    <div>
      <PageHeader title="🔫 סבב בדיקות נשקייה" subtitle="תזמון בדיקות, מעקב סטטוס ואישור מפקד"
        action={<button onClick={() => setShowNew((v) => !v)} className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700">➕ סבב חדש</button>} />

      {/* טופס סבב חדש */}
      {showNew && (
        <Card className="mb-4 p-4">
          <form action={submitNew} className="flex flex-wrap items-end gap-3">
            <div><label className="text-xs text-slate-500 block mb-1">תאריך</label>
              <input type="date" name="date" required className="rounded border border-slate-300 px-2 py-1 text-sm" /></div>
            <div><label className="text-xs text-slate-500 block mb-1">שעה</label>
              <input type="time" name="time" defaultValue="09:00" className="rounded border border-slate-300 px-2 py-1 text-sm" /></div>
            <div><label className="text-xs text-slate-500 block mb-1">מפקד בודק</label>
              <select name="inspectorSoldierId" className="rounded border border-slate-300 px-2 py-1 text-sm max-w-[180px]">
                <option value="">— בחר חייל —</option>
                {soldiers.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
              </select></div>
            <div><label className="text-xs text-slate-500 block mb-1">או שם חופשי</label>
              <input name="inspectorName" placeholder="שם המפקד" className="rounded border border-slate-300 px-2 py-1 text-sm w-32" /></div>
            {armories.length > 0 && (
              <div><label className="text-xs text-slate-500 block mb-1">ארמון</label>
                <select name="holderId" className="rounded border border-slate-300 px-2 py-1 text-sm">
                  <option value="">— </option>
                  {armories.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select></div>
            )}
            <button disabled={pending} className="bg-blue-600 text-white rounded px-4 py-1.5 text-sm hover:bg-blue-700 disabled:opacity-50">{pending ? "…" : "תזמן ושלח"}</button>
          </form>
          <p className="text-xs text-slate-400 mt-2">אם נבחר חייל עם טלגרם — יישלח אליו לינק לטופס הבדיקה. אחרת אפשר לפתוח את הלינק ידנית מהטבלה.</p>
        </Card>
      )}

      {/* טבלת סבבים */}
      <Card className="overflow-x-auto mb-4">
        {inspections.length === 0 ? <div className="p-6 text-center text-slate-400">אין סבבים עדיין</div> : (
          <table className="min-w-full text-sm">
            <thead><tr className="bg-slate-50 text-slate-500 text-xs">
              <th className="px-3 py-2 text-right">מועד</th><th className="px-3 py-2 text-right">מפקד בודק</th><th className="px-3 py-2 text-right">ארמון</th>
              <th className="px-3 py-2 text-center">סטטוס</th><th className="px-3 py-2 text-center">נחתם</th><th className="px-3 py-2"></th>
            </tr></thead>
            <tbody>
              {inspections.map((i) => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 whitespace-nowrap">{new Date(i.scheduledAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-3 py-1.5">{i.inspectorName}</td>
                  <td className="px-3 py-1.5 text-slate-500">{i.holderName || "—"}</td>
                  <td className="px-3 py-1.5 text-center">{statusBadge(i)}</td>
                  <td className="px-3 py-1.5 text-center text-xs text-slate-500">{i.completedAt ? new Date(i.completedAt).toLocaleDateString("he-IL") : "—"}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-left">
                    <a href={i.link} target="_blank" className="text-blue-600 hover:underline text-xs">{i.status === "COMPLETED" ? "צפה/הדפס" : "פתח טופס"}</a>
                    <form action={deleteArmoryInspection} className="inline ml-2" onSubmit={(e) => { if (!confirm("למחוק את הסבב?")) e.preventDefault(); }}>
                      <input type="hidden" name="id" value={i.id} />
                      <button className="text-rose-500 hover:underline text-xs">מחק</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* הגדרות — סעיפי צ'קליסט */}
      <Card className="overflow-hidden">
        <button onClick={() => setShowSettings((v) => !v)} className="w-full bg-slate-50 px-4 py-2 font-semibold text-slate-700 text-right flex items-center justify-between hover:bg-slate-100">
          <span>⚙️ הגדרות — סעיפי בדיקה</span><span>{showSettings ? "▼" : "◀"}</span>
        </button>
        {showSettings && (
          <div className="p-4">
            <div className="space-y-1.5 mb-3">
              {checklist.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className={c.active ? "" : "line-through text-slate-400"}>{c.label}</span>
                  <form action={toggleArmoryChecklistItem}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="text-xs text-slate-500 hover:underline">{c.active ? "השבת" : "הפעל"}</button>
                  </form>
                </div>
              ))}
            </div>
            <form action={(fd) => start(async () => { await addArmoryChecklistItem(fd); setNewLabel(""); })} className="flex gap-2">
              <input name="label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="סעיף בדיקה חדש" className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" />
              <button disabled={pending || !newLabel.trim()} className="bg-slate-700 text-white rounded px-3 py-1 text-sm hover:bg-slate-800 disabled:opacity-50">הוסף</button>
            </form>
          </div>
        )}
      </Card>
    </div>
  );
}
