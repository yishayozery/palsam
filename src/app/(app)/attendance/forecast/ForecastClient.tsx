"use client";

import { useState, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader, Card } from "@/components/ui";
import { markPlanRange } from "../actions";
import { useEscClose } from "@/lib/useEscClose";

type Day = { date: string; dayLabel: string; gregDay: number; gregMonth: number; isShabbat: boolean; isHoliday: boolean; holiday: string | null };
type Soldier = { id: string; fullName: string; personalNumber: string | null; companyId: string; companyName: string; squadId: string; squadName: string };
type Plan = { soldierId: string; date: string; statusId: string };
type Status = { id: string; name: string; icon: string | null; color: string; isPresent: boolean };

/** תא במטריצה — כמה מגיעים מתוך כמה, ורשימת החיילים לפירוט */
type Cell = { present: number; total: number; unmarked: number };

const cellTone = (c: Cell) => {
  if (c.total === 0) return "bg-slate-50 text-slate-300";
  const pct = c.present / c.total;
  if (pct >= 0.85) return "bg-emerald-100 text-emerald-900";
  if (pct >= 0.6) return "bg-lime-100 text-lime-900";
  if (pct >= 0.35) return "bg-amber-100 text-amber-900";
  return "bg-rose-100 text-rose-900";
};

export default function ForecastClient({
  startDate, dayCount, days, soldiers, plans, statuses, canManage,
}: {
  startDate: string; dayCount: number; days: Day[];
  soldiers: Soldier[]; plans: Plan[]; statuses: Status[]; canManage: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<{ date: string; groupLabel: string; ids: string[] } | null>(null);
  const [showRange, setShowRange] = useState(false);
  useEscClose(!!detail, () => setDetail(null));

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  // planKey = `${soldierId}|${date}` → statusId
  const planMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of plans) m.set(`${p.soldierId}|${p.date}`, p.statusId);
    return m;
  }, [plans]);

  /** חייל נחשב "מגיע" בתאריך אם הסטטוס המתוכנן שלו isPresent, או שלא סומן כלום (ברירת מחדל: מגיע) */
  const isComing = (soldierId: string, date: string): boolean => {
    const sid = planMap.get(`${soldierId}|${date}`);
    if (!sid) return true;
    return statusById.get(sid)?.isPresent ?? true;
  };
  const isUnmarked = (soldierId: string, date: string) => !planMap.has(`${soldierId}|${date}`);

  // קיבוץ: פלוגה → מחלקות
  const groups = useMemo(() => {
    const byCompany = new Map<string, { id: string; name: string; soldiers: Soldier[]; squads: Map<string, { id: string; name: string; soldiers: Soldier[] }> }>();
    for (const s of soldiers) {
      let c = byCompany.get(s.companyId);
      if (!c) { c = { id: s.companyId, name: s.companyName, soldiers: [], squads: new Map() }; byCompany.set(s.companyId, c); }
      c.soldiers.push(s);
      let q = c.squads.get(s.squadId);
      if (!q) { q = { id: s.squadId, name: s.squadName, soldiers: [] }; c.squads.set(s.squadId, q); }
      q.soldiers.push(s);
    }
    return [...byCompany.values()];
  }, [soldiers]);

  const cellFor = (list: Soldier[], date: string): Cell => {
    let present = 0, unmarked = 0;
    for (const s of list) { if (isComing(s.id, date)) present++; if (isUnmarked(s.id, date)) unmarked++; }
    return { present, total: list.length, unmarked };
  };

  function shiftStart(offsetDays: number) {
    const d = new Date(startDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + offsetDays);
    router.push(`/attendance/forecast?start=${d.toISOString().slice(0, 10)}&days=${dayCount}`);
  }

  const detailSoldiers = detail ? soldiers.filter((s) => detail.ids.includes(s.id)) : [];

  return (
    <div>
      <PageHeader
        title="📅 תחזית הגעה"
        subtitle="כמה מגיעים בכל תאריך — לפי פלוגה ומחלקה. מבוסס על התכנון בנוכחות."
        action={
          <div className="flex gap-2 flex-wrap items-center">
            <Link href="/attendance" className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs md:text-sm hover:bg-slate-50">← נוכחות</Link>
            {canManage && (
              <button onClick={() => setShowRange(true)} className="bg-blue-700 hover:bg-blue-800 text-white rounded-lg px-3 py-2 text-xs md:text-sm font-medium">
                🗓️ סימון טווח
              </button>
            )}
          </div>
        }
      />

      {/* בורר טווח */}
      <Card className="p-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => shiftStart(-dayCount)} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm hover:bg-slate-50">→ אחורה</button>
          <input type="date" value={startDate} onChange={(e) => router.push(`/attendance/forecast?start=${e.target.value}&days=${dayCount}`)}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          <select value={dayCount} onChange={(e) => router.push(`/attendance/forecast?start=${startDate}&days=${e.target.value}`)}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white">
            {[7, 14, 30, 60, 90].map((n) => <option key={n} value={n}>{n} ימים</option>)}
          </select>
          <button onClick={() => shiftStart(dayCount)} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm hover:bg-slate-50">קדימה ←</button>
          <span className="text-[11px] text-slate-500 mr-auto">מי שלא סומן נחשב מגיע. קליק על תא → רשימת השמות.</span>
        </div>
      </Card>

      {/* המטריצה — גלילה אופקית עצמאית כדי שהעמוד לא יגלוש */}
      <Card className="p-0 overflow-x-auto">
        <table className="text-xs border-collapse min-w-max">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky right-0 z-20 bg-slate-800 text-white px-3 py-2 text-right min-w-[140px]">פלוגה / מחלקה</th>
              {days.map((d) => (
                <th key={d.date} className={`px-1 py-1 text-center font-normal min-w-[38px] ${d.isShabbat || d.isHoliday ? "bg-indigo-800 text-indigo-100" : "bg-slate-800 text-white"}`}
                  title={d.holiday ?? undefined}>
                  <div className="text-[10px] opacity-70">{d.dayLabel}</div>
                  <div className="font-bold">{d.gregDay}/{d.gregMonth}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* שורת סה"כ גדוד */}
            <tr className="border-b-2 border-slate-300">
              <td className="sticky right-0 z-10 bg-slate-100 px-3 py-2 font-bold text-slate-800">סה״כ ({soldiers.length})</td>
              {days.map((d) => {
                const c = cellFor(soldiers, d.date);
                return (
                  <td key={d.date} className={`px-1 py-2 text-center font-bold cursor-pointer ${cellTone(c)}`}
                    onClick={() => setDetail({ date: d.date, groupLabel: "כל הגדוד", ids: soldiers.filter((s) => isComing(s.id, d.date)).map((s) => s.id) })}>
                    {c.present}
                  </td>
                );
              })}
            </tr>

            {groups.map((g) => {
              const open = expanded.has(g.id);
              return (
                <Fragment key={g.id}>
                  <tr className="border-b border-slate-200">
                    <td className="sticky right-0 z-10 bg-white px-3 py-2 font-medium">
                      <button onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })}
                        className="flex items-center gap-1.5 hover:text-blue-700">
                        <span className="text-slate-400">{open ? "▾" : "◂"}</span>
                        🪖 {g.name} <span className="text-[10px] text-slate-400">({g.soldiers.length})</span>
                      </button>
                    </td>
                    {days.map((d) => {
                      const c = cellFor(g.soldiers, d.date);
                      return (
                        <td key={d.date} className={`px-1 py-2 text-center cursor-pointer ${cellTone(c)}`}
                          onClick={() => setDetail({ date: d.date, groupLabel: g.name, ids: g.soldiers.filter((s) => isComing(s.id, d.date)).map((s) => s.id) })}>
                          {c.present}
                        </td>
                      );
                    })}
                  </tr>
                  {open && [...g.squads.values()].map((q) => (
                    <tr key={`${g.id}|${q.id}`} className="border-b border-slate-100 bg-slate-50/50">
                      <td className="sticky right-0 z-10 bg-slate-50 px-3 py-1.5 pr-8 text-slate-600">
                        {q.name} <span className="text-[10px] text-slate-400">({q.soldiers.length})</span>
                      </td>
                      {days.map((d) => {
                        const c = cellFor(q.soldiers, d.date);
                        return (
                          <td key={d.date} className={`px-1 py-1.5 text-center cursor-pointer ${cellTone(c)}`}
                            onClick={() => setDetail({ date: d.date, groupLabel: `${g.name} · ${q.name}`, ids: q.soldiers.filter((s) => isComing(s.id, d.date)).map((s) => s.id) })}>
                            {c.present}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* מודל פירוט תא */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" dir="rtl" onClick={() => setDetail(null)}>
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[80dvh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-slate-800 text-white p-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold">{detail.groupLabel}</h3>
                <p className="text-xs text-slate-300 mt-0.5">{detail.date} · {detailSoldiers.length} מגיעים</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-slate-300 hover:text-white text-2xl">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {detailSoldiers.map((s) => {
                const sid = planMap.get(`${s.id}|${detail.date}`);
                const st = sid ? statusById.get(sid) : null;
                return (
                  <div key={s.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2 py-1.5 text-sm">
                    <span className="flex-1">{s.fullName} <span className="font-mono text-[10px] text-slate-400">{s.personalNumber ?? ""}</span></span>
                    <span className="text-[11px] text-slate-500">{s.squadName}</span>
                    {st ? <span className="text-[11px]" style={{ color: st.color }}>{st.icon} {st.name}</span>
                        : <span className="text-[11px] text-slate-400">לא סומן</span>}
                  </div>
                );
              })}
              {detailSoldiers.length === 0 && <div className="text-center text-slate-400 text-sm py-6">אף אחד לא מגיע בתאריך הזה.</div>}
            </div>
          </div>
        </div>
      )}

      {showRange && (
        <RangeModal soldiers={soldiers} statuses={statuses} defaultStart={startDate}
          onClose={() => setShowRange(false)} onDone={() => { setShowRange(false); router.refresh(); }} />
      )}
    </div>
  );
}

/** מודל סימון טווח — חיילים × טווח תאריכים × סטטוס */
function RangeModal({ soldiers, statuses, defaultStart, onClose, onDone }: {
  soldiers: Soldier[]; statuses: Status[]; defaultStart: string;
  onClose: () => void; onDone: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState(defaultStart);
  const [to, setTo] = useState(defaultStart);
  const [statusId, setStatusId] = useState<string>(statuses[0]?.id ?? "");
  const [clear, setClear] = useState(false);
  const [overwrite, setOverwrite] = useState(true);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  useEscClose(true, onClose);

  const filt = useMemo(() => search
    ? soldiers.filter((s) => s.fullName.includes(search) || (s.personalNumber ?? "").includes(search) || s.squadName.includes(search) || s.companyName.includes(search))
    : soldiers, [soldiers, search]);

  function toggle(id: string) { setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function toggleAll() { setPicked((s) => s.size === filt.length ? new Set() : new Set(filt.map((x) => x.id))); }

  async function submit() {
    setErr(null); setOkMsg(null);
    if (picked.size === 0) { setErr("בחר לפחות חייל אחד"); return; }
    if (to < from) { setErr("תאריך הסיום מוקדם מההתחלה"); return; }
    setBusy(true);
    const r = await markPlanRange({ soldierIds: [...picked], startDate: from, endDate: to, statusId: clear ? null : statusId, overwrite });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setOkMsg(`✅ ${r.written} ימים עודכנו (${r.days} ימים × ${picked.size} חיילים)`);
    setTimeout(onDone, 1200);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-0 sm:p-4 overflow-y-auto" dir="rtl">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white p-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg">🗓️ סימון טווח תאריכים</h3>
            <p className="text-xs text-blue-200 mt-0.5">תכנון בלבד — לא משנה את הביצוע בפועל</p>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white text-2xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">מתאריך</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">עד תאריך</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-600 mb-1">סטטוס</label>
            <select value={clear ? "__clear__" : statusId} onChange={(e) => { if (e.target.value === "__clear__") { setClear(true); } else { setClear(false); setStatusId(e.target.value); } }}
              className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
              {statuses.map((s) => <option key={s.id} value={s.id}>{s.icon ?? ""} {s.name}{s.isPresent ? " (נוכח)" : ""}</option>)}
              <option value="__clear__">✕ נקה סימון בטווח</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="w-4 h-4 accent-blue-600" />
            דרוס סימונים קיימים בטווח
          </label>

          <div className="border-t border-slate-200 pt-3">
            <div className="flex items-center gap-2 mb-2">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 חיפוש חייל / מחלקה…" className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <button onClick={toggleAll} className="border border-slate-300 rounded-lg px-3 py-2 text-xs whitespace-nowrap hover:bg-slate-50">
                {picked.size === filt.length ? "נקה הכל" : `בחר הכל (${filt.length})`}
              </button>
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {filt.map((s) => (
                <label key={s.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer ${picked.has(s.id) ? "bg-blue-50 border border-blue-200" : "bg-slate-50"}`}>
                  <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} className="accent-blue-600" />
                  <span className="text-sm flex-1">{s.fullName}</span>
                  <span className="text-[11px] text-slate-500">{s.companyName} · {s.squadName}</span>
                </label>
              ))}
            </div>
          </div>

          {err && <p className="text-rose-600 text-sm text-center">{err}</p>}
          {okMsg && <p className="text-emerald-700 text-sm text-center font-medium">{okMsg}</p>}
        </div>

        <div className="border-t border-slate-200 p-3 bg-white shrink-0 flex items-center gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm">ביטול</button>
          <button onClick={submit} disabled={busy || picked.size === 0} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded-lg px-4 py-2.5 text-sm font-bold">
            {busy ? "שומר…" : `🗓️ סמן (${picked.size} חיילים)`}
          </button>
        </div>
      </div>
    </div>
  );
}
