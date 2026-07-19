"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { markForecastRange } from "./actions";
import { useEscClose } from "@/lib/useEscClose";

type Day = { date: string; dayLabel: string; gregDay: number; gregMonth: number; isShabbat: boolean; isHoliday: boolean; holiday: string | null };
type Soldier = { id: string; fullName: string; personalNumber: string | null; companyId: string; companyName: string; squadId: string; squadName: string };
type Entry = { soldierId: string; date: string; statusId: string };
type Status = { id: string; name: string; icon: string | null; color: string; inService: boolean };

/** רצף ימים עוקבים עם אותו סטטוס — כדי להציג "חול · 12/07–18/07" במקום 7 תאים */
type Block = { statusId: string; from: string; to: string; days: number };

function buildBlocks(dates: string[], statusOf: (d: string) => string | null): Block[] {
  const out: Block[] = [];
  let cur: Block | null = null;
  for (const d of dates) {
    const st = statusOf(d);
    if (st && cur && cur.statusId === st) { cur.to = d; cur.days++; continue; }
    if (cur) out.push(cur);
    cur = st ? { statusId: st, from: d, to: d, days: 1 } : null;
  }
  if (cur) out.push(cur);
  return out;
}

const short = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export default function SoldierForecastView({
  days, soldiers, entries, statuses, employmentId, canManage,
}: {
  days: Day[]; soldiers: Soldier[]; entries: Entry[]; statuses: Status[];
  employmentId: string | null; canManage: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [squadFilter, setSquadFilter] = useState("");
  const [onlyAbsent, setOnlyAbsent] = useState(false);
  const [absenceFor, setAbsenceFor] = useState<Soldier | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const dateStrs = useMemo(() => days.map((d) => d.date), [days]);
  const entryMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) m.set(`${e.soldierId}|${e.date}`, e.statusId);
    return m;
  }, [entries]);

  /** רק סימוני "לא בשמ"פ" מעניינים — בשמ"פ הוא ברירת המחדל ולא צריך רשומה */
  const absenceOf = (soldierId: string) => (d: string) => {
    const st = entryMap.get(`${soldierId}|${d}`);
    if (!st) return null;
    return statusById.get(st)?.inService === false ? st : null;
  };
  const blocksOf = (soldierId: string) => buildBlocks(dateStrs, absenceOf(soldierId));
  const absentDays = (soldierId: string) => blocksOf(soldierId).reduce((n, b) => n + b.days, 0);

  const squads = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of soldiers) m.set(s.squadId, s.squadName);
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [soldiers]);

  const filtered = useMemo(() => soldiers.filter((s) => {
    if (squadFilter && s.squadId !== squadFilter) return false;
    if (onlyAbsent && absentDays(s.id) === 0) return false;
    if (search && !s.fullName.includes(search) && !(s.personalNumber ?? "").includes(search)) return false;
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [soldiers, search, squadFilter, onlyAbsent, entryMap]);

  const totalAbsentSoldiers = soldiers.filter((s) => absentDays(s.id) > 0).length;

  /** ✅ מגיע לכל התעסוקה — מנקה את כל הסימונים של החייל */
  async function setAllComing(s: Soldier) {
    setErr(null); setBusyId(s.id);
    const r = await markForecastRange({
      soldierIds: [s.id], startDate: dateStrs[0], endDate: dateStrs[dateStrs.length - 1],
      statusId: null, employmentId,
    });
    setBusyId(null);
    if (r.error) { setErr(r.error); return; }
    router.refresh();
  }

  /** מחיקת פרק היעדרות בודד */
  async function clearBlock(s: Soldier, b: Block) {
    setErr(null); setBusyId(s.id);
    const r = await markForecastRange({ soldierIds: [s.id], startDate: b.from, endDate: b.to, statusId: null, employmentId });
    setBusyId(null);
    if (r.error) { setErr(r.error); return; }
    router.refresh();
  }

  return (
    <>
      <Card className="p-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 חיפוש חייל…"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[160px]" />
          {squads.length > 1 && (
            <select value={squadFilter} onChange={(e) => setSquadFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
              <option value="">כל המחלקות</option>
              {squads.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
          )}
          <label className="flex items-center gap-1.5 text-sm text-slate-700 whitespace-nowrap">
            <input type="checkbox" checked={onlyAbsent} onChange={(e) => setOnlyAbsent(e.target.checked)} className="w-4 h-4 accent-blue-600" />
            רק מי שלא מגיע ({totalAbsentSoldiers})
          </label>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          כל חייל <b>מגיע כברירת מחדל</b>. סמן ״לא מגיע״ רק למי שיש לו היעדרות, ובחר סיבה וטווח תאריכים.
        </p>
      </Card>

      {err && <p className="text-rose-600 text-sm text-center mb-2">{err}</p>}

      <div className="space-y-2">
        {filtered.map((s) => {
          const blocks = blocksOf(s.id);
          const absent = blocks.reduce((n, b) => n + b.days, 0);
          const coming = dateStrs.length - absent;
          const busy = busyId === s.id;
          return (
            <Card key={s.id} className={`p-3 ${absent > 0 ? "border-r-4 border-r-rose-400" : "border-r-4 border-r-emerald-400"}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{s.fullName} <span className="font-mono text-[10px] text-slate-400">{s.personalNumber ?? ""}</span></div>
                  <div className="text-[11px] text-slate-500">{s.squadName}</div>
                </div>
                <div className={`text-xs rounded-lg px-2 py-1 ${absent === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                  בשמ״פ {coming}/{dateStrs.length}
                </div>
                {canManage && (
                  <div className="mr-auto flex gap-1.5">
                    {absent > 0 && (
                      <button onClick={() => setAllComing(s)} disabled={busy}
                        className="border border-emerald-300 text-emerald-700 rounded-lg px-2.5 py-1.5 text-xs hover:bg-emerald-50 disabled:opacity-50">
                        ✅ מגיע להכל
                      </button>
                    )}
                    <button onClick={() => { setAbsenceFor(s); setErr(null); }} disabled={busy}
                      className="bg-rose-600 hover:bg-rose-700 text-white rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50">
                      🚫 לא מגיע…
                    </button>
                  </div>
                )}
              </div>

              {/* רצועת ימים — ירוק = בשמ"פ, צבע הסטטוס = היעדרות */}
              <div className="overflow-x-auto mt-2">
                <div className="flex gap-px min-w-max">
                  {days.map((d) => {
                    const st = absenceOf(s.id)(d.date);
                    const color = st ? statusById.get(st)!.color : "#10b981";
                    return (
                      <div key={d.date} className="w-2 h-5 rounded-sm shrink-0" style={{ background: color, opacity: d.isShabbat || d.isHoliday ? 0.55 : 1 }}
                        title={`${d.date}${st ? ` · ${statusById.get(st)!.name}` : " · בשמ״פ"}`} />
                    );
                  })}
                </div>
              </div>

              {/* פרקי היעדרות */}
              {blocks.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-2">
                  {blocks.map((b, i) => {
                    const st = statusById.get(b.statusId)!;
                    return (
                      <span key={i} className="text-[11px] rounded-full pr-2 pl-1 py-1 border flex items-center gap-1" style={{ borderColor: st.color, color: st.color }}>
                        {st.icon} {st.name} · {short(b.from)}{b.days > 1 ? `–${short(b.to)}` : ""} ({b.days})
                        {canManage && (
                          <button onClick={() => clearBlock(s, b)} disabled={busy}
                            className="hover:bg-slate-100 rounded-full w-4 h-4 leading-none text-slate-400 hover:text-rose-600" title="בטל">✕</button>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
        {filtered.length === 0 && <Card className="p-6 text-center text-slate-400 text-sm">אין חיילים תואמים.</Card>}
      </div>

      {absenceFor && (
        <AbsenceModal
          soldier={absenceFor} statuses={statuses} employmentId={employmentId}
          rangeStart={dateStrs[0]} rangeEnd={dateStrs[dateStrs.length - 1]}
          onClose={() => setAbsenceFor(null)}
          onDone={() => { setAbsenceFor(null); router.refresh(); }}
        />
      )}
    </>
  );
}

/** בחירת סיבה + טווח תאריכים לחייל בודד */
function AbsenceModal({ soldier, statuses, employmentId, rangeStart, rangeEnd, onClose, onDone }: {
  soldier: Soldier; statuses: Status[]; employmentId: string | null;
  rangeStart: string; rangeEnd: string; onClose: () => void; onDone: () => void;
}) {
  const reasons = statuses.filter((s) => !s.inService);
  const [statusId, setStatusId] = useState(reasons[0]?.id ?? "");
  const [from, setFrom] = useState(rangeStart);
  const [to, setTo] = useState(rangeEnd);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEscClose(true, onClose);

  const dayCount = Math.round((new Date(to + "T00:00:00Z").getTime() - new Date(from + "T00:00:00Z").getTime()) / 86400000) + 1;

  async function submit() {
    setErr(null);
    if (to < from) { setErr("תאריך הסיום מוקדם מההתחלה"); return; }
    if (!statusId) { setErr("בחר סיבה"); return; }
    setBusy(true);
    const r = await markForecastRange({ soldierIds: [soldier.id], startDate: from, endDate: to, statusId, employmentId });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" dir="rtl">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-rose-600 to-rose-700 text-white p-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold">🚫 לא מגיע — {soldier.fullName}</h3>
            <p className="text-xs text-rose-200 mt-0.5">{soldier.squadName}</p>
          </div>
          <button onClick={onClose} className="text-rose-200 hover:text-white text-2xl">✕</button>
        </div>

        <div className="p-3 space-y-3">
          <div>
            <label className="block text-[11px] text-slate-600 mb-1.5">סיבה</label>
            <div className="grid grid-cols-2 gap-1.5">
              {reasons.map((r) => (
                <button key={r.id} onClick={() => setStatusId(r.id)}
                  className={`rounded-lg px-2 py-2 text-sm border text-right ${statusId === r.id ? "border-2 font-medium" : "border-slate-200 bg-slate-50"}`}
                  style={statusId === r.id ? { borderColor: r.color, color: r.color, background: `${r.color}12` } : undefined}>
                  {r.icon} {r.name}
                </button>
              ))}
            </div>
            {reasons.length === 0 && <p className="text-xs text-rose-600">לא הוגדרו סיבות היעדרות בהגדרות הנוכחות.</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">מתאריך</label>
              <input type="date" value={from} min={rangeStart} max={rangeEnd} onChange={(e) => setFrom(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">עד תאריך</label>
              <input type="date" value={to} min={rangeStart} max={rangeEnd} onChange={(e) => setTo(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm" />
            </div>
          </div>
          <p className="text-[11px] text-slate-500 text-center">
            {dayCount > 0 ? `${dayCount} ימים` : ""} · לימים מפוצלים — סמן שוב עם טווח נוסף
          </p>

          {err && <p className="text-rose-600 text-sm text-center">{err}</p>}
        </div>

        <div className="border-t border-slate-200 p-3 flex items-center gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm">ביטול</button>
          <button onClick={submit} disabled={busy || !statusId} className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg px-4 py-2.5 text-sm font-bold">
            {busy ? "שומר…" : "🚫 שמור היעדרות"}
          </button>
        </div>
      </div>
    </div>
  );
}
