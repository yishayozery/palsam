"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitAttendanceReport } from "./actions";

type Status = { id: string; name: string; icon: string | null; color: string; isPresent: boolean };
type Sol = { id: string; name: string; pn: string | null; squad: string | null };
type Mark = { soldierId: string; statusId: string };

export default function AttendanceReportClient({
  soldierId, token, date, today, mode, scopeName, battalionName, reporterName, soldiers, statuses, records, plans,
}: {
  soldierId: string; token: string; date: string; today: string; mode: "plan" | "record";
  scopeName: string; battalionName: string; reporterName: string;
  soldiers: Sol[]; statuses: Status[]; records: Mark[]; plans: Mark[];
}) {
  const router = useRouter();
  const source = mode === "plan" ? plans : records;
  const [marks, setMarks] = useState<Record<string, string | null>>(() => Object.fromEntries(source.map((r) => [r.soldierId, r.statusId])));
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const planMap = useMemo(() => Object.fromEntries(plans.map((p) => [p.soldierId, p.statusId])), [plans]);
  const presentIds = useMemo(() => new Set(statuses.filter((s) => s.isPresent).map((s) => s.id)), [statuses]);
  const marked = soldiers.filter((s) => marks[s.id]).length;
  const present = soldiers.filter((s) => marks[s.id] && presentIds.has(marks[s.id]!)).length;
  const filtered = q.trim() ? soldiers.filter((s) => s.name.includes(q) || (s.pn ?? "").includes(q)) : soldiers;
  const isPlan = mode === "plan";
  const accent = isPlan ? "#2563eb" : "#059669"; // כחול=תכנון · ירוק=ביצוע

  const nav = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ t: token, date, mode, ...patch });
    router.push(`?${p.toString()}`);
  };
  function setStatus(sid: string, statusId: string) { setMarks((m) => ({ ...m, [sid]: m[sid] === statusId ? null : statusId })); }
  function copyFromPlan() {
    const next: Record<string, string | null> = { ...marks };
    let n = 0;
    for (const s of soldiers) { const ps = planMap[s.id]; if (ps) { next[s.id] = ps; n++; } }
    setMarks(next);
    setErr(n === 0 ? "אין תכנון ליום זה להעתקה" : null);
  }
  function submit() {
    setErr(null);
    start(async () => {
      const entries = soldiers.map((s) => ({ soldierId: s.id, statusId: marks[s.id] ?? null }));
      const r = await submitAttendanceReport(soldierId, token, date, mode, entries);
      if (r.error) { setErr(r.error); return; }
      setDone(`✅ ${isPlan ? "התכנון נשמר" : "הדיווח נשלח"} — ${present} נוכחים מתוך ${soldiers.length}`);
    });
  }

  const dateLabel = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", day: "2-digit", month: "2-digit" }).format(new Date(date + "T00:00:00"));

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: isPlan ? "#eff6ff" : "#f0fdf4", fontFamily: "system-ui, sans-serif" }}>
      <div className="max-w-md mx-auto p-3 pb-28">
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
        <div className="text-[11px] text-center mb-2" style={{ color: accent }}>{isPlan ? "מתכננים קדימה — לא נחשב לביצוע בפועל" : "מדווחים מצב בפועל — היום (או בחלון המותר)"}</div>

        {done ? (
          <div className="text-center py-10"><div className="text-5xl mb-3">✅</div><p className="font-bold text-emerald-700">{done}</p>
            <button onClick={() => setDone(null)} className="mt-4 text-sm text-indigo-600 hover:underline">חזרה לעריכה</button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <input type="date" value={date} min={isPlan ? today : undefined} onChange={(e) => nav({ date: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 חייל…" className="flex-1 min-w-[100px] border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              {!isPlan && <button onClick={copyFromPlan} className="text-xs bg-blue-600 text-white rounded-lg px-3 py-2 font-medium hover:bg-blue-700">📋 העתק מהתכנון</button>}
            </div>
            <div className="text-xs text-slate-500 mb-2">🟢 {present} נוכחים · סומנו {marked}/{soldiers.length}</div>

            <div className="space-y-1.5">
              {filtered.map((s) => (
                <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-slate-800">{s.name}{s.pn && <span className="text-[11px] text-slate-400 mr-1">· {s.pn}</span>}</span>
                    {s.squad && <span className="text-[10px] text-slate-400">{s.squad}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {statuses.map((st) => {
                      const on = marks[s.id] === st.id;
                      return (
                        <button key={st.id} onClick={() => setStatus(s.id, st.id)} className="text-xs rounded-lg px-2.5 py-1 border font-medium"
                          style={on ? { background: st.color, color: "#fff", borderColor: st.color } : { background: "#fff", color: "#475569", borderColor: "#e2e8f0" }}>
                          {st.icon ? `${st.icon} ` : ""}{st.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {err && <p className="text-rose-600 text-sm text-center mt-3">{err}</p>}
          </>
        )}
      </div>

      {!done && (
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-3 border-t" style={{ background: isPlan ? "#eff6ff" : "#f0fdf4", borderColor: "#e2e8f0" }}>
          <button onClick={submit} disabled={pending} className="w-full disabled:opacity-50 text-white rounded-xl py-3 font-bold" style={{ background: accent }}>
            {pending ? "שומר…" : isPlan ? `📝 שמור תכנון (${present} נוכחים)` : `✅ שלח דיווח (${present} נוכחים)`}
          </button>
          <p className="text-[11px] text-slate-400 text-center mt-1">אפשר לשמור שוב לעדכון.</p>
        </div>
      )}
    </div>
  );
}
