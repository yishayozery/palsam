"use client";

import { useState, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader, Card } from "@/components/ui";
import { markForecastRange } from "./actions";
import { useEscClose } from "@/lib/useEscClose";
import SoldierForecastView from "./SoldierForecastView";

type Employment = { id: string; name: string; startDate: string; endDate: string; active: boolean };
type Day = { date: string; dayLabel: string; gregDay: number; gregMonth: number; isShabbat: boolean; isHoliday: boolean; holiday: string | null };
type Soldier = { id: string; fullName: string; personalNumber: string | null; companyId: string; companyName: string; squadId: string; squadName: string };
type Entry = { soldierId: string; date: string; statusId: string };
type Status = { id: string; name: string; icon: string | null; color: string; inService: boolean };
type Allocation = { companyId: string; date: string; allocated: number };

/** תא: כמה בשמ"פ מתוך כמה, ומול התקן ליום (אם הוגדר) */
type Cell = { inService: number; total: number; allocated: number | null };

function cellTone(c: Cell): string {
  if (c.total === 0) return "bg-slate-50 text-slate-300";
  // כשיש תקן — הצבע נגזר מהפער מולו. אחרת מאחוז ההגעה.
  if (c.allocated !== null && c.allocated > 0) {
    if (c.inService >= c.allocated) return "bg-emerald-100 text-emerald-900";
    if (c.inService >= c.allocated * 0.85) return "bg-amber-100 text-amber-900";
    return "bg-rose-100 text-rose-900";
  }
  const pct = c.inService / c.total;
  if (pct >= 0.85) return "bg-emerald-100 text-emerald-900";
  if (pct >= 0.6) return "bg-lime-100 text-lime-900";
  if (pct >= 0.35) return "bg-amber-100 text-amber-900";
  return "bg-rose-100 text-rose-900";
}

export default function ForecastClient({
  view, employments, selectedEmploymentId, startDate, dayCount, days,
  soldiers, entries, statuses, allocations, canManage,
}: {
  view: "soldiers" | "matrix";
  employments: Employment[]; selectedEmploymentId: string | null;
  startDate: string; dayCount: number; days: Day[];
  soldiers: Soldier[]; entries: Entry[]; statuses: Status[]; allocations: Allocation[]; canManage: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<{ date: string; groupLabel: string; soldiers: Soldier[] } | null>(null);
  const [showRange, setShowRange] = useState(false);
  useEscClose(!!detail, () => setDetail(null));

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const entryMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) m.set(`${e.soldierId}|${e.date}`, e.statusId);
    return m;
  }, [entries]);
  const allocMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of allocations) m.set(`${a.companyId}|${a.date}`, a.allocated);
    return m;
  }, [allocations]);

  /** לא סומן → בשמ"פ (ברירת מחדל: מגיע). */
  const inService = (soldierId: string, date: string): boolean => {
    const sid = entryMap.get(`${soldierId}|${date}`);
    if (!sid) return true;
    return statusById.get(sid)?.inService ?? true;
  };

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

  const cellFor = (list: Soldier[], date: string, companyId?: string): Cell => {
    let n = 0;
    for (const s of list) if (inService(s.id, date)) n++;
    const allocated = companyId ? allocMap.get(`${companyId}|${date}`) ?? null
      : (allocations.length > 0 ? [...groups].reduce((sum, g) => sum + (allocMap.get(`${g.id}|${date}`) ?? 0), 0) || null : null);
    return { inService: n, total: list.length, allocated };
  };

  /** פילוח הסיבות ליום — רק מי שלא בשמ"פ */
  const reasonsFor = (list: Soldier[], date: string) => {
    const m = new Map<string, number>();
    for (const s of list) {
      const sid = entryMap.get(`${s.id}|${date}`);
      const st = sid ? statusById.get(sid) : null;
      if (st && !st.inService) m.set(st.id, (m.get(st.id) ?? 0) + 1);
    }
    return [...m.entries()].map(([id, n]) => ({ status: statusById.get(id)!, n })).sort((a, b) => b.n - a.n);
  };

  function go(params: Record<string, string>) {
    const q = new URLSearchParams();
    if (selectedEmploymentId) q.set("employmentId", selectedEmploymentId);
    else { q.set("start", startDate); q.set("days", String(dayCount)); }
    q.set("view", view);
    for (const [k, v] of Object.entries(params)) q.set(k, v);
    router.push(`/attendance/forecast?${q.toString()}`);
  }

  const selectedEmp = employments.find((e) => e.id === selectedEmploymentId) ?? null;
  const totalCell = (d: string) => cellFor(soldiers, d);

  return (
    <div>
      <PageHeader
        title="📅 תחזית הגעה"
        subtitle="שלב הצווים — מי מגיע לתעסוקה ומתי. מסכם לבשמ״פ / לא בשמ״פ."
        action={
          <div className="flex gap-2 flex-wrap items-center">
            <Link href="/attendance" className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs md:text-sm hover:bg-slate-50">← נוכחות</Link>
            {canManage && view === "matrix" && (
              <button onClick={() => setShowRange(true)} className="bg-blue-700 hover:bg-blue-800 text-white rounded-lg px-3 py-2 text-xs md:text-sm font-medium">
                🗓️ סימון קבוצתי
              </button>
            )}
          </div>
        }
      />

      {/* מעבר בין תצוגת עדכון (חייל-חייל) לתצוגת פיקוד (תאריכים × פלוגות) */}
      <div className="flex rounded-xl overflow-hidden border-2 border-slate-200 text-sm font-bold mb-3 w-fit">
        <button onClick={() => go({ view: "soldiers" })}
          className={`px-4 py-2 transition-colors ${view === "soldiers" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
          🙋 לפי חייל
        </button>
        <button onClick={() => go({ view: "matrix" })}
          className={`px-4 py-2 transition-colors ${view === "matrix" ? "bg-slate-700 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
          📊 לפי תאריך
        </button>
      </div>

      <Card className="p-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-slate-600">תעסוקה</label>
          <select value={selectedEmploymentId ?? ""} onChange={(e) => router.push(`/attendance/forecast?employmentId=${e.target.value}&view=${view}`)}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white">
            {employments.length === 0 && <option value="">— לא הוגדרו תעסוקות —</option>}
            {employments.map((e) => <option key={e.id} value={e.id}>{e.active ? "🟢 " : ""}{e.name} ({e.startDate} → {e.endDate})</option>)}
          </select>
          {!selectedEmp && (
            <>
              <input type="date" value={startDate} onChange={(e) => go({ start: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
              <select value={dayCount} onChange={(e) => go({ days: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                {[7, 14, 30, 60, 90].map((n) => <option key={n} value={n}>{n} ימים</option>)}
              </select>
            </>
          )}
          <span className="text-[11px] text-slate-500 mr-auto">
            מי שלא סומן נחשב בשמ״פ. קליק על תא → פירוט.{allocations.length > 0 ? " המספר התחתון = התקן ליום." : ""}
          </span>
        </div>
      </Card>

      {view === "soldiers" && (
        <SoldierForecastView days={days} soldiers={soldiers} entries={entries} statuses={statuses}
          employmentId={selectedEmploymentId} canManage={canManage} />
      )}

      {view === "matrix" && (
      <Card className="p-0 overflow-x-auto">
        <table className="text-xs border-collapse min-w-max">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky right-0 z-20 bg-slate-800 text-white px-3 py-2 text-right min-w-[140px]">פלוגה / מחלקה</th>
              {days.map((d) => (
                <th key={d.date} className={`px-1 py-1 text-center font-normal min-w-[40px] ${d.isShabbat || d.isHoliday ? "bg-indigo-800 text-indigo-100" : "bg-slate-800 text-white"}`} title={d.holiday ?? undefined}>
                  <div className="text-[10px] opacity-70">{d.dayLabel}</div>
                  <div className="font-bold">{d.gregDay}/{d.gregMonth}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b-2 border-slate-300">
              <td className="sticky right-0 z-10 bg-slate-100 px-3 py-2 font-bold text-slate-800">בשמ״פ — סה״כ ({soldiers.length})</td>
              {days.map((d) => {
                const c = totalCell(d.date);
                return (
                  <td key={d.date} className={`px-1 py-2 text-center font-bold cursor-pointer ${cellTone(c)}`}
                    onClick={() => setDetail({ date: d.date, groupLabel: "כל הגדוד", soldiers })}>
                    {c.inService}
                    {c.allocated !== null && <div className="text-[9px] font-normal opacity-60">/{c.allocated}</div>}
                  </td>
                );
              })}
            </tr>
            <tr className="border-b-2 border-slate-300 bg-rose-50/40">
              <td className="sticky right-0 z-10 bg-rose-50 px-3 py-1.5 font-medium text-rose-800">לא בשמ״פ</td>
              {days.map((d) => {
                const c = totalCell(d.date);
                const missing = c.total - c.inService;
                return (
                  <td key={d.date} className={`px-1 py-1.5 text-center ${missing > 0 ? "text-rose-700 font-bold" : "text-slate-300"}`}>
                    {missing || "—"}
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
                      const c = cellFor(g.soldiers, d.date, g.id);
                      return (
                        <td key={d.date} className={`px-1 py-2 text-center cursor-pointer ${cellTone(c)}`}
                          onClick={() => setDetail({ date: d.date, groupLabel: g.name, soldiers: g.soldiers })}>
                          {c.inService}
                          {c.allocated !== null && <div className="text-[9px] font-normal opacity-60">/{c.allocated}</div>}
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
                            onClick={() => setDetail({ date: d.date, groupLabel: `${g.name} · ${q.name}`, soldiers: q.soldiers })}>
                            {c.inService}
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
      )}

      {detail && (() => {
        const list = detail.soldiers;
        const coming = list.filter((s) => inService(s.id, detail.date));
        const notComing = list.filter((s) => !inService(s.id, detail.date));
        const reasons = reasonsFor(list, detail.date);
        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" dir="rtl" onClick={() => setDetail(null)}>
            <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[85dvh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="bg-slate-800 text-white p-4 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="font-bold">{detail.groupLabel}</h3>
                  <p className="text-xs text-slate-300 mt-0.5">{detail.date} · בשמ״פ {coming.length} · לא בשמ״פ {notComing.length}</p>
                </div>
                <button onClick={() => setDetail(null)} className="text-slate-300 hover:text-white text-2xl">✕</button>
              </div>
              {reasons.length > 0 && (
                <div className="flex gap-2 flex-wrap p-3 border-b border-slate-200 bg-slate-50">
                  {reasons.map((r) => (
                    <span key={r.status.id} className="text-[11px] rounded-full px-2 py-1 border" style={{ borderColor: r.status.color, color: r.status.color }}>
                      {r.status.icon} {r.status.name} · {r.n}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {notComing.length > 0 && <div className="text-[11px] font-bold text-rose-700 mt-1 mb-1">לא בשמ״פ</div>}
                {notComing.map((s) => {
                  const st = statusById.get(entryMap.get(`${s.id}|${detail.date}`)!);
                  return (
                    <div key={s.id} className="flex items-center gap-2 bg-rose-50 rounded-lg px-2 py-1.5 text-sm">
                      <span className="flex-1">{s.fullName} <span className="font-mono text-[10px] text-slate-400">{s.personalNumber ?? ""}</span></span>
                      <span className="text-[11px] text-slate-500">{s.squadName}</span>
                      {st && <span className="text-[11px] font-medium" style={{ color: st.color }}>{st.icon} {st.name}</span>}
                    </div>
                  );
                })}
                {coming.length > 0 && <div className="text-[11px] font-bold text-emerald-700 mt-3 mb-1">בשמ״פ</div>}
                {coming.map((s) => {
                  const st = statusById.get(entryMap.get(`${s.id}|${detail.date}`)!);
                  return (
                    <div key={s.id} className="flex items-center gap-2 bg-emerald-50/60 rounded-lg px-2 py-1.5 text-sm">
                      <span className="flex-1">{s.fullName} <span className="font-mono text-[10px] text-slate-400">{s.personalNumber ?? ""}</span></span>
                      <span className="text-[11px] text-slate-500">{s.squadName}</span>
                      <span className="text-[11px]" style={{ color: st?.color ?? "#94a3b8" }}>{st ? `${st.icon} ${st.name}` : "לא סומן"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {showRange && (
        <RangeModal soldiers={soldiers} statuses={statuses} defaultStart={startDate} defaultEnd={days[days.length - 1]?.date ?? startDate}
          employmentId={selectedEmploymentId}
          onClose={() => setShowRange(false)} onDone={() => { setShowRange(false); router.refresh(); }} />
      )}
    </div>
  );
}

/** מודל סימון טווח — חיילים × טווח תאריכים × סטטוס תחזית */
function RangeModal({ soldiers, statuses, defaultStart, defaultEnd, employmentId, onClose, onDone }: {
  soldiers: Soldier[]; statuses: Status[]; defaultStart: string; defaultEnd: string;
  employmentId: string | null; onClose: () => void; onDone: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState(defaultStart);
  const [to, setTo] = useState(defaultEnd);
  const [statusId, setStatusId] = useState<string>(statuses.find((s) => !s.inService)?.id ?? statuses[0]?.id ?? "");
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
    const r = await markForecastRange({ soldierIds: [...picked], startDate: from, endDate: to, statusId: clear ? null : statusId, employmentId });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setOkMsg(`✅ ${r.written} ימים עודכנו (${r.days} ימים × ${picked.size} חיילים)`);
    setTimeout(onDone, 1200);
  }

  const inServiceOpts = statuses.filter((s) => s.inService);
  const absentOpts = statuses.filter((s) => !s.inService);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-0 sm:p-4 overflow-y-auto" dir="rtl">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white p-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg">🗓️ סימון תחזית לטווח</h3>
            <p className="text-xs text-blue-200 mt-0.5">שלב הצווים — לא נוגע בנוכחות בפועל</p>
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
            <select value={clear ? "__clear__" : statusId}
              onChange={(e) => { if (e.target.value === "__clear__") setClear(true); else { setClear(false); setStatusId(e.target.value); } }}
              className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
              <optgroup label="בשמ״פ">
                {inServiceOpts.map((s) => <option key={s.id} value={s.id}>{s.icon ?? ""} {s.name}</option>)}
              </optgroup>
              <optgroup label="לא בשמ״פ">
                {absentOpts.map((s) => <option key={s.id} value={s.id}>{s.icon ?? ""} {s.name}</option>)}
              </optgroup>
              <option value="__clear__">✕ נקה סימון בטווח (חוזר לבשמ״פ)</option>
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
