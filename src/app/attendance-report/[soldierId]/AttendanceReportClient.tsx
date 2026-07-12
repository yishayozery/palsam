"use client";

import { useState, useMemo, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { submitAttendanceReport, heartbeatPresence } from "./actions";

type Status = { id: string; name: string; icon: string | null; color: string; isPresent: boolean };
type Sol = { id: string; name: string; pn: string | null; squad: string | null };
type Mark = { soldierId: string; statusId: string };
type OtherReporter = { name: string; minutesAgo: number; submittedAt: string | null };
type Presence = { others: OtherReporter[]; lastSubmit: { name: string; at: string; byMe: boolean } | null };

const heDate = (ymd: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", ...opts }).format(new Date(ymd + "T00:00:00"));
const hhmm = (iso: string) => new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default function AttendanceReportClient({
  soldierId, token, date, today, mode, windowDates, scopeName, battalionName, reporterName, soldiers, statuses, records, plans, yesterday, presence,
}: {
  soldierId: string; token: string; date: string; today: string; mode: "plan" | "record"; windowDates: string[];
  scopeName: string; battalionName: string; reporterName: string;
  soldiers: Sol[]; statuses: Status[]; records: Mark[]; plans: Mark[]; yesterday: Mark[]; presence: Presence;
}) {
  const router = useRouter();
  const [pres, setPres] = useState<Presence>(presence);
  const source = mode === "plan" ? plans : records;
  const [marks, setMarks] = useState<Record<string, string | null>>(() => Object.fromEntries(source.map((r) => [r.soldierId, r.statusId])));
  const [extraDates, setExtraDates] = useState<string[]>([]); // ימים נוספים מלבד היום הראשי
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // heartbeat — מסמן שהנאמן פעיל ומושך מי עוד פעיל (תיאום בין 2 נאמנים). כל 75 שנ' + במצב פתיחה.
  const beat = useCallback(async (submitted = false) => {
    try { setPres(await heartbeatPresence(soldierId, token, date, submitted)); } catch { /* לא קריטי */ }
  }, [soldierId, token, date]);
  useEffect(() => {
    const t = setTimeout(() => beat(), 0);
    const id = setInterval(() => beat(), 75_000);
    return () => { clearTimeout(t); clearInterval(id); };
  }, [beat]);

  const statusById = useMemo(() => Object.fromEntries(statuses.map((s) => [s.id, s])), [statuses]);
  const planMap = useMemo(() => Object.fromEntries(plans.map((p) => [p.soldierId, p.statusId])), [plans]);
  const yestMap = useMemo(() => Object.fromEntries(yesterday.map((p) => [p.soldierId, p.statusId])), [yesterday]);
  const presentIds = useMemo(() => new Set(statuses.filter((s) => s.isPresent).map((s) => s.id)), [statuses]);
  const isPlan = mode === "plan";
  const accent = isPlan ? "#2563eb" : "#059669"; // כחול=תכנון · ירוק=ביצוע

  const marked = soldiers.filter((s) => marks[s.id]).length;
  const present = soldiers.filter((s) => marks[s.id] && presentIds.has(marks[s.id]!)).length;
  const filtered = q.trim() ? soldiers.filter((s) => s.name.includes(q) || (s.pn ?? "").includes(q)) : soldiers;

  // פירוט לפי סטטוס לסיכום התחתון
  const perStatus = useMemo(() => statuses.map((st) => ({ st, count: soldiers.filter((s) => marks[s.id] === st.id).length })).filter((x) => x.count > 0), [statuses, soldiers, marks]);

  const otherDates = windowDates.filter((d) => d !== date);
  const targetDates = [date, ...extraDates].filter((d, i, a) => a.indexOf(d) === i).sort();

  const nav = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ t: token, date, mode, ...patch });
    router.push(`?${p.toString()}`);
  };
  function setMark(sid: string, statusId: string | null) { setMarks((m) => ({ ...m, [sid]: statusId })); }
  function toggleExtra(d: string) { setExtraDates((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]); }
  function copyFromPlan() {
    const next: Record<string, string | null> = { ...marks };
    let n = 0;
    for (const s of soldiers) { const ps = planMap[s.id]; if (ps) { next[s.id] = ps; n++; } }
    setMarks(next);
    setErr(n === 0 ? "אין תכנון ליום זה להעתקה" : null);
  }
  function fillRest(statusId: string) { // מילוי מהיר לכל מי שלא סומן (למשל "כולם נמצאים")
    setMarks((m) => { const next = { ...m }; for (const s of soldiers) if (!next[s.id]) next[s.id] = statusId; return next; });
  }
  function reloadFresh() { // טעינת הדיווח העדכני (למשל אחרי שנאמן אחר עדכן) — מרענן את הסימונים
    if (confirm("לטעון את הדיווח העדכני? שינויים שסימנת ולא נשמרו יאבדו.")) window.location.reload();
  }
  function submit() {
    setErr(null);
    start(async () => {
      const entries = soldiers.map((s) => ({ soldierId: s.id, statusId: marks[s.id] ?? null }));
      const r = await submitAttendanceReport(soldierId, token, targetDates, mode, entries);
      if (r.error) { setErr(r.error); return; }
      void beat(true); // סימון "דיווחתי עכשיו" לנאמנים האחרים
      const daysTxt = (r.days ?? 1) > 1 ? ` · ${r.days} ימים` : "";
      setDone(`✅ ${isPlan ? "התכנון נשמר" : "הדיווח נשלח"} — ${present} נוכחים מתוך ${soldiers.length}${daysTxt}`);
    });
  }

  const dateLabel = heDate(date, { weekday: "long", day: "2-digit", month: "2-digit" });

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: isPlan ? "#eff6ff" : "#f0fdf4", fontFamily: "system-ui, sans-serif" }}>
      <div className="max-w-md mx-auto p-3 pb-40">
        <div className="text-center mb-2">
          <h1 className="text-lg font-bold text-slate-800">{isPlan ? "📝 תכנון נוכחות" : "✅ דיווח בפועל"} — {scopeName}</h1>
          <p className="text-xs text-slate-500">{battalionName} · {dateLabel}</p>
          <p className="text-[11px] text-slate-400">מדווח: {reporterName}</p>
        </div>

        {/* מתג מצב — תכנון / ביצוע */}
        <div className="flex rounded-xl overflow-hidden border-2 text-sm font-bold mb-2" style={{ borderColor: "#e2e8f0" }}>
          <button onClick={() => nav({ mode: "plan" })} className="flex-1 py-2" style={isPlan ? { background: "#2563eb", color: "#fff" } : { background: "#fff", color: "#64748b" }}>📝 תכנון</button>
          <button onClick={() => nav({ mode: "record" })} className="flex-1 py-2" style={!isPlan ? { background: "#059669", color: "#fff" } : { background: "#fff", color: "#64748b" }}>✅ ביצוע בפועל</button>
        </div>

        {/* תיאום בין 2 נאמנים על אותה קבוצה */}
        {!done && pres.others.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-lg px-2.5 py-2 text-[12px] text-amber-900 mb-2">
            ⚠️ <b>נאמן נוסף פעיל כרגע</b> על {scopeName}: {pres.others.map((o) => `${o.name} (${o.minutesAgo === 0 ? "עכשיו" : `לפני ${o.minutesAgo} דק'`})`).join(" · ")}.
            <div className="text-amber-700 mt-0.5">עבודה במקביל עלולה לדרוס אחד את השני — תאמו ביניכם, ורעננו לפני עדכון.</div>
            <button onClick={reloadFresh} className="mt-1 text-[11px] bg-amber-600 text-white rounded px-2 py-0.5 font-medium">🔄 רענן לדיווח העדכני</button>
          </div>
        )}
        {!done && pres.lastSubmit && (
          <div className="text-[11px] text-slate-500 text-center mb-2">
            עודכן לאחרונה: <b>{pres.lastSubmit.byMe ? "על ידך" : pres.lastSubmit.name}</b> · {hhmm(pres.lastSubmit.at)}
            {!pres.lastSubmit.byMe && <button onClick={reloadFresh} className="mr-1 text-indigo-600 underline">רענן</button>}
          </div>
        )}

        {done ? (
          <div className="text-center py-10"><div className="text-5xl mb-3">✅</div><p className="font-bold text-emerald-700">{done}</p>
            <button onClick={() => setDone(null)} className="mt-4 text-sm text-indigo-600 hover:underline">חזרה לעריכה</button>
          </div>
        ) : (
          <>
            {/* תאריך ראשי + חיפוש */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <input type="date" value={date} min={isPlan ? today : undefined} onChange={(e) => nav({ date: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 חייל…" className="flex-1 min-w-[100px] border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </div>

            {/* ריבוי ימים — החל את אותו דיווח גם על ימים נוספים (למשל חמישי → שישי+שבת) */}
            {otherDates.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-lg p-2 mb-2">
                <div className="text-[11px] text-slate-500 mb-1">📅 החל את הדיווח גם על:</div>
                <div className="flex flex-wrap gap-1">
                  {otherDates.map((d) => {
                    const on = extraDates.includes(d);
                    return (
                      <button key={d} onClick={() => toggleExtra(d)} className="text-[11px] rounded-lg px-2 py-1 border font-medium"
                        style={on ? { background: accent, color: "#fff", borderColor: accent } : { background: "#fff", color: "#475569", borderColor: "#e2e8f0" }}>
                        {heDate(d, { weekday: "short" })} {heDate(d, { day: "2-digit", month: "2-digit" })}
                      </button>
                    );
                  })}
                </div>
                {targetDates.length > 1 && <div className="text-[11px] mt-1 font-medium" style={{ color: accent }}>יישלח ל-{targetDates.length} ימים</div>}
              </div>
            )}

            {/* מקרא + פעולות מהירות */}
            <div className="bg-white border border-slate-200 rounded-lg p-2 mb-2">
              <div className="flex flex-wrap gap-x-3 gap-y-1 mb-1">
                {statuses.map((st) => (
                  <span key={st.id} className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                    <span>{st.icon ?? "•"}</span>{st.name}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {statuses.filter((s) => s.isPresent).slice(0, 1).map((s) => (
                  <button key={s.id} onClick={() => fillRest(s.id)} className="text-[11px] bg-slate-100 text-slate-700 rounded-lg px-2 py-1 border border-slate-200">
                    {s.icon} סמן את השאר כ{s.name}
                  </button>
                ))}
              </div>
            </div>

            {/* העתקת התכנון לביצוע — בולט (רק במצב ביצוע) */}
            {!isPlan && (
              <button onClick={copyFromPlan} className="w-full mb-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-sm font-bold">
                📋 העתק את התכנון לביצוע
              </button>
            )}

            <div className="text-xs text-slate-500 mb-2">🟢 {present} נוכחים · סומנו {marked}/{soldiers.length}</div>

            {/* שורה אחת לכל חייל */}
            <div className="space-y-1">
              {filtered.map((s) => {
                const cur = marks[s.id];
                const curSt = cur ? statusById[cur] : null;
                const y = yestMap[s.id] ? statusById[yestMap[s.id]] : null;
                return (
                  <div key={s.id} className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-slate-800 truncate leading-tight">{s.name}</div>
                      {y && <div className="text-[10px] text-slate-400 leading-tight">אתמול {y.icon} {y.name}</div>}
                    </div>
                    {/* בורר סטטוס בגלילה — כדי שלא ישתנה בטעות בלחיצה */}
                    <select value={cur ?? ""} onChange={(e) => setMark(s.id, e.target.value || null)}
                      className="shrink-0 rounded-lg border px-2 py-2 text-sm font-medium min-w-[7.5rem]"
                      style={curSt ? { background: curSt.color + "1a", color: curSt.color, borderColor: curSt.color } : { background: "#fff", color: "#94a3b8", borderColor: "#e2e8f0" }}>
                      <option value="">— בחר —</option>
                      {statuses.map((st) => <option key={st.id} value={st.id}>{st.icon ? `${st.icon} ` : ""}{st.name}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
            {err && <p className="text-rose-600 text-sm text-center mt-3">{err}</p>}
          </>
        )}
      </div>

      {!done && (
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-3 border-t" style={{ background: isPlan ? "#eff6ff" : "#f0fdf4", borderColor: "#e2e8f0" }}>
          {/* סיכום דיווח */}
          <div className="flex flex-wrap items-center gap-1.5 mb-2 text-[11px]">
            <span className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-600">סומנו {marked}/{soldiers.length}</span>
            {perStatus.map(({ st, count }) => (
              <span key={st.id} className="rounded px-1.5 py-0.5 border" style={{ color: st.color, borderColor: st.color + "55", background: st.color + "12" }}>
                {st.icon} {count}
              </span>
            ))}
            {soldiers.length - marked > 0 && <span className="bg-amber-50 border border-amber-200 text-amber-700 rounded px-1.5 py-0.5">חסרים {soldiers.length - marked}</span>}
          </div>
          <button onClick={submit} disabled={pending} className="w-full disabled:opacity-50 text-white rounded-xl py-3 font-bold" style={{ background: accent }}>
            {pending ? "שומר…" : isPlan ? `📝 שמור תכנון (${present} נוכחים)` : `✅ שלח דיווח (${present} נוכחים)${targetDates.length > 1 ? ` · ${targetDates.length} ימים` : ""}`}
          </button>
          <p className="text-[11px] text-slate-400 text-center mt-1">אפשר לשמור שוב לעדכון.</p>
        </div>
      )}
    </div>
  );
}
