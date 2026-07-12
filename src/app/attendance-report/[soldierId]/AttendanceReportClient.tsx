"use client";

import { useState, useMemo, useTransition } from "react";
import { submitAttendanceReport } from "./actions";

type Status = { id: string; name: string; icon: string | null; color: string; isPresent: boolean };
type Sol = { id: string; name: string; pn: string | null; squad: string | null };

export default function AttendanceReportClient({
  soldierId, token, date, scopeName, battalionName, reporterName, soldiers, statuses, records,
}: {
  soldierId: string; token: string; date: string; scopeName: string; battalionName: string; reporterName: string;
  soldiers: Sol[]; statuses: Status[]; records: { soldierId: string; statusId: string }[];
}) {
  const [marks, setMarks] = useState<Record<string, string | null>>(() => Object.fromEntries(records.map((r) => [r.soldierId, r.statusId])));
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const presentIds = useMemo(() => new Set(statuses.filter((s) => s.isPresent).map((s) => s.id)), [statuses]);
  const marked = soldiers.filter((s) => marks[s.id]).length;
  const present = soldiers.filter((s) => marks[s.id] && presentIds.has(marks[s.id]!)).length;
  const filtered = q.trim() ? soldiers.filter((s) => s.name.includes(q) || (s.pn ?? "").includes(q)) : soldiers;

  function setStatus(sid: string, statusId: string) {
    setMarks((m) => ({ ...m, [sid]: m[sid] === statusId ? null : statusId }));
  }
  function submit() {
    setErr(null);
    start(async () => {
      const entries = soldiers.map((s) => ({ soldierId: s.id, statusId: marks[s.id] ?? null }));
      const r = await submitAttendanceReport(soldierId, token, date, entries);
      if (r.error) { setErr(r.error); return; }
      setDone(`✅ הדיווח נשלח — ${present} נוכחים מתוך ${soldiers.length}`);
    });
  }

  const dateLabel = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", day: "2-digit", month: "2-digit" }).format(new Date(date + "T00:00:00"));

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50" style={{ fontFamily: "system-ui, sans-serif" }}>
      <div className="max-w-md mx-auto p-3 pb-24">
        <div className="text-center mb-3">
          <h1 className="text-lg font-bold text-slate-800">🗓️ דיווח נוכחות — {scopeName}</h1>
          <p className="text-xs text-slate-500">{battalionName} · {dateLabel}</p>
          <p className="text-[11px] text-slate-400">מדווח: {reporterName}</p>
        </div>

        {done ? (
          <div className="text-center py-10"><div className="text-5xl mb-3">✅</div><p className="font-bold text-emerald-700">{done}</p>
            <button onClick={() => setDone(null)} className="mt-4 text-sm text-indigo-600 hover:underline">חזרה לעריכה</button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 חיפוש חייל…" className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <span className="text-xs text-slate-500 whitespace-nowrap">🟢 {present} · סומנו {marked}/{soldiers.length}</span>
            </div>

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
                        <button key={st.id} onClick={() => setStatus(s.id, st.id)}
                          className="text-xs rounded-lg px-2.5 py-1 border font-medium"
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
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-3 bg-slate-50 border-t border-slate-200">
          <button onClick={submit} disabled={pending}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl py-3 font-bold">
            {pending ? "שולח…" : `✅ שלח דיווח (${present} נוכחים)`}
          </button>
          <p className="text-[11px] text-slate-400 text-center mt-1">אפשר לשלוח שוב לעדכון במהלך היום.</p>
        </div>
      )}
    </div>
  );
}
