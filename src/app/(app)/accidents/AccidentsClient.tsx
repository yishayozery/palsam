"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui";
import { createAccidentReport, getAccidentFillLink, deleteAccidentReport } from "./actions";

type Report = {
  id: string; type: string; status: string; createdAt: string;
  location: string | null; plate: string | null; driver: string | null; photos: number;
};

const TYPE_LABEL: Record<string, string> = { ARMY_SELF: "צבא עצמי", ARMY_ARMY: "צבא עם צבא", CIVILIAN: "מעורבות אזרח" };
const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "ממתין למילוי חייל", cls: "bg-amber-100 text-amber-700" },
  OFFICER_REVIEW: { label: "אצל קצין הרכב", cls: "bg-sky-100 text-sky-700" },
  MAGAD_REVIEW: { label: 'אישור מג"ד', cls: "bg-violet-100 text-violet-700" },
  EXAMINER_REVIEW: { label: "אישור בוחן רכב", cls: "bg-indigo-100 text-indigo-700" },
  APPROVED: { label: "הושלם", cls: "bg-emerald-100 text-emerald-700" },
};

export default function AccidentsClient({ reports }: { reports: Report[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [linkFor, setLinkFor] = useState<{ id: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function create(type: string) {
    start(async () => {
      const r = await createAccidentReport(type as never);
      setLinkFor({ id: r.id, link: r.link });
      router.refresh();
    });
  }
  async function showLink(id: string) {
    const r = await getAccidentFillLink(id);
    if (r.link) { setLinkFor({ id, link: r.link }); setCopied(false); }
  }
  function del(id: string) {
    if (!confirm("למחוק את הדיווח?")) return;
    start(async () => { await deleteAccidentReport(id); router.refresh(); });
  }
  const wa = (link: string) => `https://wa.me/?text=${encodeURIComponent(`מילוי דיווח תאונה — חלק א:\n${link}`)}`;

  return (
    <div className="space-y-4">
      {/* יצירת דיווח */}
      <Card className="p-3">
        <div className="text-xs font-bold text-slate-600 mb-2">➕ דיווח תאונה חדש — בחר סוג ושלח לחייל למילוי</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button disabled={pending} onClick={() => create("ARMY_SELF")} className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50">🚙 צבא עצמי</button>
          <button disabled={pending} onClick={() => create("ARMY_ARMY")} className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50">🚙💥🚙 צבא עם צבא</button>
          <button disabled={pending} onClick={() => create("CIVILIAN")} className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50">🚗 מעורבות אזרח</button>
        </div>
      </Card>

      {/* לינק שנוצר */}
      {linkFor && (
        <Card className="p-3 border-emerald-300 bg-emerald-50">
          <div className="text-xs font-bold text-emerald-800 mb-2">🔗 לינק למילוי חלק א — שלח לחייל:</div>
          <div className="flex gap-2 flex-wrap items-center">
            <input readOnly value={linkFor.link} className="flex-1 min-w-[180px] border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white font-mono" onFocus={(e) => e.target.select()} />
            <button onClick={() => { navigator.clipboard.writeText(linkFor.link); setCopied(true); }} className="bg-slate-700 text-white rounded-lg px-3 py-1.5 text-xs">{copied ? "✓ הועתק" : "העתק"}</button>
            <a href={wa(linkFor.link)} target="_blank" rel="noreferrer" className="bg-emerald-600 text-white rounded-lg px-3 py-1.5 text-xs">📲 וואטסאפ</a>
            <button onClick={() => setLinkFor(null)} className="text-slate-400 text-xs">✕</button>
          </div>
        </Card>
      )}

      {/* רשימה */}
      {reports.length === 0 ? (
        <Card className="p-8 text-center text-slate-400">אין דיווחי תאונה עדיין</Card>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => {
            const st = STATUS[r.status] ?? { label: r.status, cls: "bg-slate-100 text-slate-600" };
            return (
              <Card key={r.id} className="p-3 flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-slate-800">{TYPE_LABEL[r.type] ?? r.type}</span>
                    <Badge className={st.cls}>{st.label}</Badge>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {new Date(r.createdAt).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}
                    {r.plate && ` · רכב ${r.plate}`}{r.driver && ` · ${r.driver}`}{r.location && ` · ${r.location}`}
                    {` · 📷 ${r.photos}`}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.status === "DRAFT" && <button onClick={() => showLink(r.id)} className="text-xs bg-sky-600 text-white rounded-lg px-3 py-1.5">🔗 לינק</button>}
                  {r.status !== "DRAFT" && <a href={`/accidents/${r.id}`} className="text-xs bg-slate-700 text-white rounded-lg px-3 py-1.5">פתח</a>}
                  {r.status === "DRAFT" && <button onClick={() => del(r.id)} className="text-xs text-rose-500 hover:text-rose-700">🗑️</button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
