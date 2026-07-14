"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import { PageHeader, Card } from "@/components/ui";
import { createArmoryInspection, updateArmoryInspection, deleteArmoryInspection, addArmoryChecklistItem, toggleArmoryChecklistItem } from "./actions";

type Inspection = {
  id: string; scheduledAt: string; inspectorSoldierId: string; inspectorName: string; inspectorNameRaw: string;
  holderId: string; holderName: string; status: string; overallOk: boolean | null; completedAt: string | null; total: number; faults: number; link: string;
};
type Metrics = { open: number; okCount: number; faultCount: number; faultsTotal: number; lastCompletedAt: string | null };

function ilDate(iso: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(iso)); }
function ilTime(iso: string) { return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)); }

export default function InspectionsClient({ inspections, metrics, checklist, soldiers, armories }: {
  inspections: Inspection[]; metrics: Metrics;
  checklist: { id: string; label: string; active: boolean }[];
  soldiers: { id: string; fullName: string }[];
  armories: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  const [showSettings, setShowSettings] = useState(false);
  const [showNew, setShowNew] = useState(inspections.length === 0);
  const [editId, setEditId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [q, setQ] = useState("");
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => { const t = setTimeout(() => setNowMs(Date.now()), 0); return () => clearTimeout(t); }, []);

  const daysSince = (iso: string | null) => (nowMs && iso ? Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 86_400_000)) : null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return inspections;
    return inspections.filter((i) => [i.inspectorName, i.holderName, i.status].join(" ").toLowerCase().includes(s));
  }, [inspections, q]);

  const submitNew = (fd: FormData) => start(async () => { const r = await createArmoryInspection(fd); if (r.error) alert(r.error); else setShowNew(false); });
  const submitEdit = (fd: FormData) => start(async () => { const r = await updateArmoryInspection(fd); if (r.error) alert(r.error); else setEditId(null); });

  const statusBadge = (i: Inspection) => {
    if (i.status !== "COMPLETED") return <span className="text-xs rounded-full px-2 py-0.5 bg-slate-100 text-slate-600">מתוכנן</span>;
    if (i.overallOk) return <span className="text-xs rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-700">✅ תקין</span>;
    return <span className="text-xs rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">⚠️ {i.faults} ליקויים</span>;
  };

  const shareWa = (link: string) => window.open(`https://wa.me/?text=${encodeURIComponent(`🔫 טופס סבב בדיקת נשקייה:\n${window.location.origin}${link}`)}`, "_blank");

  const formFields = (row?: Inspection) => (
    <>
      <div><label className="text-xs text-slate-500 block mb-1">תאריך</label>
        <input type="date" name="date" required defaultValue={row ? ilDate(row.scheduledAt) : ""} className="rounded border border-slate-300 px-2 py-1 text-sm" /></div>
      <div><label className="text-xs text-slate-500 block mb-1">שעה</label>
        <input type="time" name="time" defaultValue={row ? ilTime(row.scheduledAt) : "09:00"} className="rounded border border-slate-300 px-2 py-1 text-sm" /></div>
      <div><label className="text-xs text-slate-500 block mb-1">מפקד בודק</label>
        <select name="inspectorSoldierId" defaultValue={row?.inspectorSoldierId ?? ""} className="rounded border border-slate-300 px-2 py-1 text-sm max-w-[180px]">
          <option value="">— בחר חייל —</option>{soldiers.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
        </select></div>
      <div><label className="text-xs text-slate-500 block mb-1">או שם חופשי</label>
        <input name="inspectorName" defaultValue={row?.inspectorNameRaw ?? ""} placeholder="שם המפקד" className="rounded border border-slate-300 px-2 py-1 text-sm w-32" /></div>
      {armories.length > 0 && (
        <div><label className="text-xs text-slate-500 block mb-1">ארמון</label>
          <select name="holderId" defaultValue={row?.holderId ?? ""} className="rounded border border-slate-300 px-2 py-1 text-sm">
            <option value="">— </option>{armories.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select></div>
      )}
    </>
  );

  const editRow = editId ? inspections.find((i) => i.id === editId) : null;
  const daysSinceLast = daysSince(metrics.lastCompletedAt);

  return (
    <div>
      <PageHeader title="🔫 סבב בדיקות נשקייה" subtitle="תזמון בדיקות, מעקב סטטוס ואישור מפקד"
        action={<button onClick={() => { setShowNew((v) => !v); setEditId(null); }} className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700">➕ סבב חדש</button>} />

      {/* מדדים עליונים */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <Card className="p-3 text-center"><div className="text-2xl font-bold text-slate-700">{metrics.open}</div><div className="text-xs text-slate-500">מתוכננים (פתוחים)</div></Card>
        <Card className="p-3 text-center"><div className="text-2xl font-bold text-amber-600">{metrics.faultsTotal}</div><div className="text-xs text-slate-500">ליקויים שדווחו</div></Card>
        <Card className="p-3 text-center"><div className="text-2xl font-bold text-emerald-600">{metrics.okCount}</div><div className="text-xs text-slate-500">סבבים תקינים</div></Card>
        <Card className="p-3 text-center"><div className="text-2xl font-bold text-blue-600">{daysSinceLast == null ? "—" : daysSinceLast}</div><div className="text-xs text-slate-500">ימים מהבדיקה האחרונה</div></Card>
      </div>

      {/* טופס סבב חדש / עריכה */}
      {(showNew || editRow) && (
        <Card className="mb-4 p-4">
          <form action={editRow ? submitEdit : submitNew} className="flex flex-wrap items-end gap-3">
            {editRow && <input type="hidden" name="id" value={editRow.id} />}
            {formFields(editRow ?? undefined)}
            <button disabled={pending} className="bg-blue-600 text-white rounded px-4 py-1.5 text-sm hover:bg-blue-700 disabled:opacity-50">{pending ? "…" : editRow ? "שמור שינויים" : "תזמן ושלח"}</button>
            {editRow && <button type="button" onClick={() => setEditId(null)} className="text-sm text-slate-400">ביטול</button>}
          </form>
          {!editRow && <p className="text-xs text-slate-400 mt-2">אם נבחר חייל עם טלגרם — יישלח אליו לינק לטופס הבדיקה. אחרת אפשר לשלוח את הלינק בווטסאפ מהטבלה.</p>}
        </Card>
      )}

      {/* חיפוש */}
      <div className="mb-2"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 חיפוש (מפקד / ארמון / סטטוס)" className="w-full max-w-sm rounded border border-slate-300 px-3 py-1.5 text-sm" /></div>

      {/* טבלת סבבים */}
      <Card className="overflow-x-auto mb-4">
        {filtered.length === 0 ? <div className="p-6 text-center text-slate-400">אין סבבים</div> : (
          <table className="min-w-full text-sm">
            <thead><tr className="bg-slate-50 text-slate-500 text-xs">
              <th className="px-3 py-2 text-right">מועד</th><th className="px-3 py-2 text-center">ימים מפתיחה</th><th className="px-3 py-2 text-right">מפקד בודק</th><th className="px-3 py-2 text-right">ארמון</th>
              <th className="px-3 py-2 text-center">סטטוס</th><th className="px-3 py-2 text-center">נחתם</th><th className="px-3 py-2"></th>
            </tr></thead>
            <tbody>
              {filtered.map((i) => {
                const d = i.status !== "COMPLETED" ? daysSince(i.scheduledAt) : null;
                return (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 whitespace-nowrap">{new Date(i.scheduledAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-3 py-1.5 text-center">{d == null ? "—" : <span className={d > 7 ? "text-rose-600 font-semibold" : "text-slate-500"}>{d}</span>}</td>
                  <td className="px-3 py-1.5">{i.inspectorName}</td>
                  <td className="px-3 py-1.5 text-slate-500">{i.holderName || "—"}</td>
                  <td className="px-3 py-1.5 text-center">{statusBadge(i)}</td>
                  <td className="px-3 py-1.5 text-center text-xs text-slate-500">{i.completedAt ? new Date(i.completedAt).toLocaleDateString("he-IL") : "—"}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-left space-x-2 space-x-reverse">
                    <a href={i.link} target="_blank" className="text-blue-600 hover:underline text-xs">{i.status === "COMPLETED" ? "צפה/הדפס" : "פתח טופס"}</a>
                    <button onClick={() => shareWa(i.link)} className="text-emerald-600 hover:underline text-xs">ווטסאפ</button>
                    {i.status !== "COMPLETED" && <button onClick={() => { setEditId(i.id); setShowNew(false); }} className="text-slate-600 hover:underline text-xs">עריכה</button>}
                    <form action={deleteArmoryInspection} className="inline" onSubmit={(e) => { if (!confirm("למחוק את הסבב?")) e.preventDefault(); }}>
                      <input type="hidden" name="id" value={i.id} /><button className="text-rose-500 hover:underline text-xs">מחק</button>
                    </form>
                  </td>
                </tr>
              ); })}
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
                  <form action={toggleArmoryChecklistItem}><input type="hidden" name="id" value={c.id} /><button className="text-xs text-slate-500 hover:underline">{c.active ? "השבת" : "הפעל"}</button></form>
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
