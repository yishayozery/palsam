"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleAttendanceReporter, saveReportWindow, saveReportOverride, deleteReportOverride } from "../../attendance/actions";

type Sol = { id: string; name: string; squadName: string | null; isReporter: boolean; allCompany?: boolean };
type Comp = { companyId: string; companyName: string; soldiers: Sol[] };
type Override = { id: string; date: string; daysForward: number; note: string | null };
const DOW = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export default function RosterAttendanceSettings({ companies, window, overrides }: { companies: Comp[]; window: number[]; overrides: Override[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<"reporters" | "window" | null>(null);
  const [win, setWin] = useState<number[]>(() => Array.from({ length: 7 }, (_, i) => window[i] ?? 0));
  const [winMsg, setWinMsg] = useState<string | null>(null);
  const [ovDate, setOvDate] = useState(""); const [ovFwd, setOvFwd] = useState(2); const [ovNote, setOvNote] = useState("");
  // בוררים מדורגים: פלוגה → מחלקה → חייל
  const [selComp, setSelComp] = useState(""); const [selSquad, setSelSquad] = useState(""); const [selSol, setSelSol] = useState("");

  const reporterCount = companies.reduce((n, c) => n + c.soldiers.filter((s) => s.isReporter).length, 0);
  const SQUAD_NONE = "— ללא מחלקה —";
  const activeComp = companies.find((c) => c.companyId === selComp);
  const squadsOf = (c: Comp | undefined) => c ? [...new Set(c.soldiers.map((s) => s.squadName || SQUAD_NONE))].sort((a, b) => a.localeCompare(b, "he")) : [];
  const addableSoldiers = (activeComp?.soldiers ?? [])
    .filter((s) => !s.isReporter && (!selSquad || (s.squadName || SQUAD_NONE) === selSquad));
  // כיסוי: פלוגה ללא נאמן, ומחלקות ללא נאמן בתוך פלוגה שיש בה נאמן
  const coverage = companies.map((c) => {
    const squads = [...new Set(c.soldiers.map((s) => s.squadName || SQUAD_NONE))];
    const squadGaps = squads.filter((sq) => !c.soldiers.some((s) => (s.squadName || SQUAD_NONE) === sq && s.isReporter));
    const hasAny = c.soldiers.some((s) => s.isReporter);
    return { id: c.companyId, name: c.companyName, hasAny, squadGaps };
  });
  const compsNoReporter = coverage.filter((c) => !c.hasAny);

  return (
    <>
      <button onClick={() => setOpen("reporters")} className="text-xs bg-white border border-slate-300 text-slate-700 rounded-lg px-3 py-1.5 hover:bg-slate-50">
        ⚙️ נאמני כ״א ({reporterCount})
      </button>
      <button onClick={() => setOpen("window")} className="text-xs bg-white border border-slate-300 text-slate-700 rounded-lg px-3 py-1.5 hover:bg-slate-50">
        ⚙️ הגדרות דיווח עתידי
      </button>

      {open === "reporters" && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start sm:items-center justify-center p-3" onClick={() => setOpen(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-slate-800 text-white p-4 rounded-t-2xl flex items-center justify-between">
              <h3 className="font-bold">🗓️ נאמני כ״א</h3>
              <button onClick={() => setOpen(null)} className="text-slate-300 text-xl">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-xs text-slate-500">נאמן כ״א מקבל את תזכורת הבוקר בבוט ויכול לדווח נוכחות (גם מהבית). היקף: המחלקה שלו אם נבחרה מחלקה, אחרת כל הפלוגה.</p>

              {/* כיסוי — מי עדיין ללא נאמן */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="text-xs font-bold text-slate-600 mb-2">📊 כיסוי נאמנים</div>
                {compsNoReporter.length > 0 && (
                  <div className="mb-2">
                    <span className="text-[11px] text-rose-600 font-semibold">פלוגות ללא נאמן: </span>
                    {compsNoReporter.map((c) => <span key={c.id} className="inline-block text-[11px] bg-rose-100 text-rose-700 rounded px-2 py-0.5 ml-1 mb-1">⚠️ {c.name}</span>)}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {coverage.map((c) => (
                    <span key={c.id} title={c.squadGaps.length ? `מחלקות ללא נאמן: ${c.squadGaps.join(", ")}` : "מכוסה"}
                      className={`text-[11px] rounded px-2 py-0.5 ${c.hasAny ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                      {c.hasAny ? "✅" : "⚠️"} {c.name}{c.hasAny && c.squadGaps.length > 0 ? ` · ${c.squadGaps.length} מחלקות חסרות` : ""}
                    </span>
                  ))}
                </div>
              </div>

              {/* הוספת נאמן — פלוגה → מחלקה → חייל */}
              <div className="border border-slate-200 rounded-xl p-3">
                <div className="text-xs font-bold text-slate-600 mb-2">➕ שיבוץ נאמן</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select value={selComp} onChange={(e) => { setSelComp(e.target.value); setSelSquad(""); setSelSol(""); }} className="rounded-lg border border-slate-300 px-2 py-2 text-sm bg-white">
                    <option value="">פלוגה…</option>
                    {companies.map((c) => <option key={c.companyId} value={c.companyId}>{c.companyName}</option>)}
                  </select>
                  <select value={selSquad} onChange={(e) => { setSelSquad(e.target.value); setSelSol(""); }} disabled={!selComp} className="rounded-lg border border-slate-300 px-2 py-2 text-sm bg-white disabled:bg-slate-50">
                    <option value="">כל המחלקה…</option>
                    {squadsOf(activeComp).map((sq) => <option key={sq} value={sq}>{sq}</option>)}
                  </select>
                  <select value={selSol} onChange={(e) => setSelSol(e.target.value)} disabled={!selComp} className="rounded-lg border border-slate-300 px-2 py-2 text-sm bg-white disabled:bg-slate-50">
                    <option value="">חייל…</option>
                    {addableSoldiers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.squadName ? ` · ${s.squadName}` : ""}</option>)}
                  </select>
                </div>
                <button disabled={!selSol || pending} onClick={() => start(async () => { await toggleAttendanceReporter(selSol, !selSquad); setSelSol(""); router.refresh(); })}
                  className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">{pending ? "…" : "➕ סמן כנאמן"}</button>
              </div>

              {/* נאמנים נוכחיים */}
              <div>
                <div className="text-xs font-bold text-slate-600 mb-2">🗓️ נאמנים משובצים ({reporterCount})</div>
                {reporterCount === 0 ? <p className="text-xs text-slate-400">אין נאמנים משובצים עדיין.</p> : companies.map((c) => {
                  const reps = c.soldiers.filter((s) => s.isReporter);
                  if (!reps.length) return null;
                  return (
                    <div key={c.companyId} className="mb-2">
                      <div className="text-xs font-bold text-slate-700 mb-1">🪖 {c.companyName}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {reps.map((s) => (
                          <span key={s.id} className="inline-flex items-center gap-1 text-xs bg-sky-100 text-sky-800 rounded-full pl-1 pr-2 py-0.5">
                            {s.name}<span className="text-[10px] text-sky-600">· {s.allCompany || !s.squadName ? "כל הפלוגה" : s.squadName}</span>
                            <button onClick={() => start(async () => { await toggleAttendanceReporter(s.id); router.refresh(); })} disabled={pending} className="text-sky-500 hover:text-rose-600 font-bold">✕</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {open === "window" && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start sm:items-center justify-center p-3" onClick={() => setOpen(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-slate-800 text-white p-4 rounded-t-2xl flex items-center justify-between">
              <h3 className="font-bold">🗓️ הגדרות דיווח עתידי</h3>
              <button onClick={() => setOpen(null)} className="text-slate-300 text-xl">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-2">כמה ימים <b>קדימה</b> מותר לדווח נוכחות בכל יום בשבוע. (לדוגמה: חמישי=2 → מותר לדווח על שישי ושבת).</p>
                <div className="grid grid-cols-2 gap-2">
                  {DOW.map((d, i) => (
                    <label key={i} className="flex items-center justify-between gap-2 text-sm bg-slate-50 rounded-lg px-3 py-1.5">
                      <span>{d}</span>
                      <input type="number" min={0} max={14} value={win[i]}
                        onChange={(e) => setWin((w) => w.map((v, j) => j === i ? (parseInt(e.target.value) || 0) : v))}
                        className="w-16 rounded border border-slate-300 px-2 py-1 text-sm text-center" />
                    </label>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={() => { setWinMsg(null); start(async () => { const r = await saveReportWindow(win); if (r?.error) { setWinMsg("❌ " + r.error); } else { setWinMsg("✅ נשמר"); router.refresh(); } }); }} disabled={pending}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">{pending ? "שומר…" : "💾 שמור חלון"}</button>
                  {winMsg && <span className={`text-sm font-medium ${winMsg.startsWith("✅") ? "text-emerald-700" : "text-rose-600"}`}>{winMsg}</span>}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <div className="text-sm font-bold text-slate-700 mb-1">📅 חריגות תאריך (לפני חגים)</div>
                <p className="text-xs text-slate-500 mb-2">ביום ספציפי — מותר לדווח יותר ימים קדימה.</p>
                <div className="flex gap-2 flex-wrap items-end mb-2">
                  <input type="date" value={ovDate} onChange={(e) => setOvDate(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  <div><label className="block text-[10px] text-slate-500">ימים קדימה</label><input type="number" min={0} value={ovFwd} onChange={(e) => setOvFwd(parseInt(e.target.value) || 0)} className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></div>
                  <input value={ovNote} onChange={(e) => setOvNote(e.target.value)} placeholder="הערה (חג)" className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm flex-1 min-w-[100px]" />
                  <button onClick={() => { if (ovDate) start(async () => { await saveReportOverride(ovDate, ovFwd, ovNote); setOvDate(""); setOvNote(""); router.refresh(); }); }} disabled={pending || !ovDate}
                    className="bg-slate-800 text-white rounded-lg px-3 py-1.5 text-sm disabled:opacity-50">➕</button>
                </div>
                {overrides.map((o) => (
                  <div key={o.id} className="flex items-center justify-between text-sm border-b border-slate-100 py-1">
                    <span>{o.date} · <b>{o.daysForward}</b> ימים{o.note ? ` · ${o.note}` : ""}</span>
                    <button onClick={() => start(async () => { await deleteReportOverride(o.id); router.refresh(); })} disabled={pending} className="text-rose-400 hover:text-rose-600 text-xs">🗑️</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
