"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleAttendanceReporter, saveReportWindow, saveReportOverride, deleteReportOverride } from "../../attendance/actions";

type Sol = { id: string; name: string; squadName: string | null; isReporter: boolean };
type Comp = { companyId: string; companyName: string; soldiers: Sol[] };
type Override = { id: string; date: string; daysForward: number; note: string | null };
const DOW = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export default function RosterAttendanceSettings({ companies, window, overrides }: { companies: Comp[]; window: number[]; overrides: Override[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<"reporters" | "window" | null>(null);
  const [win, setWin] = useState<number[]>(() => Array.from({ length: 7 }, (_, i) => window[i] ?? 0));
  const [ovDate, setOvDate] = useState(""); const [ovFwd, setOvFwd] = useState(2); const [ovNote, setOvNote] = useState("");
  const [q, setQ] = useState("");

  const reporterCount = companies.reduce((n, c) => n + c.soldiers.filter((s) => s.isReporter).length, 0);

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
            <div className="p-4">
              <p className="text-xs text-slate-500 mb-2">מי שמסומן מקבל את תזכורת הבוקר בבוט ויכול לדווח נוכחות (גם מהבית). היקף: המחלקה שלו אם משויך, אחרת כל הפלוגה.</p>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חפש/י שם…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3" />
              {companies.map((c) => {
                const sols = c.soldiers.filter((s) => !q || s.name.includes(q));
                if (!sols.length) return null;
                return (
                  <div key={c.companyId} className="mb-3">
                    <div className="text-sm font-bold text-slate-700 mb-1">🪖 {c.companyName}</div>
                    <div className="space-y-1">
                      {sols.map((s) => (
                        <label key={s.id} className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-slate-50 cursor-pointer">
                          <input type="checkbox" checked={s.isReporter} disabled={pending}
                            onChange={() => start(async () => { await toggleAttendanceReporter(s.id); router.refresh(); })}
                            className="w-4 h-4 rounded accent-sky-600" />
                          <span className={s.isReporter ? "font-medium text-slate-800" : "text-slate-600"}>{s.name}</span>
                          {s.squadName && <span className="text-[10px] text-slate-400">· {s.squadName}</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
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
                <button onClick={() => start(async () => { await saveReportWindow(win); router.refresh(); })} disabled={pending}
                  className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">{pending ? "…" : "💾 שמור חלון"}</button>
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
