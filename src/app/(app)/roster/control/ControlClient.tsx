"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { toggleCompanyLock } from "../../attendance/actions";
import RosterAttendanceSettings from "./RosterAttendanceSettings";
import ShmapPanel from "./ShmapPanel";

type Company = { id: string; name: string; total: number; reported: number; shmp: number; shmpReported: number; locked: boolean };
type StatusCard = { id: string; name: string; color: string; icon: string; isPresent: boolean; count: number; pns: string[] };
type NotReported = { count: number; pns: string[] };
type Employment = { id: string; name: string; startDate: string; endDate: string; active: boolean };
type AggCount = { statusId: string; n: number; pct: number };
type AggRow = { id: string; name: string; pn: string; company: string; cells: string[]; shmp: boolean[]; shmpDays: number; reportedDays: number; counts: AggCount[] };

export default function ControlClient({
  date, companies, statuses, notReported, totals,
  employments, selectedEmploymentId, range, days, aggRows, canManageEmployment, attendanceSettings, shmpSoldiers, today,
}: {
  date: string;
  companies: Company[];
  statuses: StatusCard[];
  notReported: { inShmp: NotReported; offShmp: NotReported };
  totals: { soldiers: number; reported: number; companiesReported: number; companiesTotal: number };
  employments: Employment[];
  selectedEmploymentId: string | null;
  range: { start: string; end: string; manual: boolean };
  days: string[];
  aggRows: AggRow[];
  canManageEmployment: boolean;
  today: string;
  shmpSoldiers: { id: string; name: string; company: string; squad: string | null; callup: { id: string; start: string; end: string | null } | null }[];
  attendanceSettings: {
    companies: { companyId: string; companyName: string; soldiers: { id: string; name: string; squadName: string | null; isReporter: boolean }[] }[];
    window: number[];
    overrides: { id: string; date: string; daysForward: number; note: string | null }[];
  };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);
  const [filterCompany, setFilterCompany] = useState<string>("");
  const [popupSoldier, setPopupSoldier] = useState<AggRow | null>(null);

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const selectedEmployment = employments.find((e) => e.id === selectedEmploymentId) ?? null;

  function shiftDay(delta: number) {
    const d = new Date(date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + delta);
    router.push(`/roster/control?date=${d.toISOString().slice(0, 10)}`);
  }
  function copyPns(key: string, pns: string[]) {
    navigator.clipboard?.writeText(pns.join("\n")).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    }).catch(() => {});
  }
  function lock(companyId: string, val: boolean) {
    start(async () => { await toggleCompanyLock(companyId, date, val); router.refresh(); });
  }
  function lockAll(val: boolean) {
    start(async () => { for (const c of companies) { if (c.locked !== val) await toggleCompanyLock(c.id, date, val); } router.refresh(); });
  }
  function pushRange(params: Record<string, string>) {
    const qs = new URLSearchParams({ date });
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    router.push(`/roster/control?${qs.toString()}`);
  }

  const companyNames = useMemo(() => [...new Set(aggRows.map((r) => r.company))], [aggRows]);
  const filteredAgg = useMemo(() => aggRows.filter((r) => !filterCompany || r.company === filterCompany), [aggRows, filterCompany]);

  const dayLabel = (d: string) => { const [, m, dd] = d.split("-"); return `${+dd}/${+m}`; };
  const dowShort = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
  const dow = (d: string) => dowShort[new Date(d + "T00:00:00Z").getUTCDay()];

  return (
    <div className="space-y-5">
      {/* סרגל תאריך + סיכום */}
      <Card className="p-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-1 border border-slate-200">
          <button onClick={() => shiftDay(-1)} className="rounded bg-white border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100">◀ יום</button>
          <input type="date" value={date} onChange={(e) => e.target.value && router.push(`/roster/control?date=${e.target.value}`)}
            className="rounded border border-slate-300 px-2 py-1 text-sm" />
          <button onClick={() => shiftDay(1)} className="rounded bg-white border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100">יום ▶</button>
        </div>
        <div className="text-sm text-slate-600">
          דיווחו: <b>{totals.reported}</b>/{totals.soldiers} חיילים · <b>{totals.companiesReported}</b>/{totals.companiesTotal} פלוגות
        </div>
        <div className="mr-auto flex gap-2 flex-wrap">
          <RosterAttendanceSettings companies={attendanceSettings.companies} window={attendanceSettings.window} overrides={attendanceSettings.overrides} />
          <button onClick={() => lockAll(true)} disabled={pending} className="text-xs bg-rose-600 text-white rounded-lg px-3 py-1.5 hover:bg-rose-700 disabled:opacity-50">🔒 נעל הכל</button>
          <button onClick={() => lockAll(false)} disabled={pending} className="text-xs border border-slate-300 text-slate-600 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50">🔓 פתח הכל</button>
        </div>
      </Card>

      {/* 🟣 ניהול שמ״פ — פתיחה/סגירה מרוכזת + עריכת תאריכים */}
      <ShmapPanel soldiers={shmpSoldiers} today={today} />

      {/* סרגל תעסוקה — בחירה + ניהול + תקני פלוגות (שלישות) */}
      {employments.length > 0 && (
        <Card className="p-3 flex items-center gap-3 flex-wrap">
          <label className="text-sm font-medium text-slate-700">📊 תעסוקה:</label>
          <select value={selectedEmploymentId ?? ""} onChange={(e) => pushRange({ employmentId: e.target.value })}
            className="rounded-lg border-2 border-slate-300 px-3 py-1.5 text-sm min-w-[200px]">
            <option value="">— ללא תעסוקה —</option>
            {employments.map((e) => <option key={e.id} value={e.id}>{e.active ? "🟢 " : ""}{e.name} ({e.startDate.slice(5)}→{e.endDate.slice(5)})</option>)}
          </select>
          {canManageEmployment && (
            <a href="/employment" className="text-xs text-blue-600 hover:text-blue-800 underline">ניהול תעסוקות</a>
          )}
          {selectedEmployment && (
            <a href={`/employment/${selectedEmployment.id}`} className="text-xs bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-2 py-1 rounded-lg font-medium">
              ⚙️ תקני פלוגות
            </a>
          )}
        </Card>
      )}

      {/* בלוק פילוח יומי — הכל בשורה אחת (לחיצה = העתקת מ.א) */}
      <div>
        <h3 className="font-bold text-slate-700 text-sm mb-2">📊 פילוח יום {dayLabel(date)} — לחיצה מעתיקה מ.א</h3>
        <div className="flex flex-wrap gap-2 items-stretch">
          {/* טרם דיווחו — מודגשים, בתחילת השורה */}
          <button onClick={() => copyPns("nr_shmp", notReported.inShmp.pns)} disabled={notReported.inShmp.pns.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-rose-300 bg-rose-50 px-2.5 py-1.5 text-sm hover:bg-rose-100 disabled:opacity-50">
            <span className="font-bold text-rose-800">🔴 טרם דיווחו·שמ״פ</span>
            <b className="text-rose-800 text-base">{notReported.inShmp.count}</b>
            <span className="text-[10px] text-rose-500">{copied === "nr_shmp" ? "✓" : `📋${notReported.inShmp.pns.length}`}</span>
          </button>
          <button onClick={() => copyPns("nr_off", notReported.offShmp.pns)} disabled={notReported.offShmp.pns.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50">
            <span className="font-medium text-slate-500">⚪ טרם·חוץ</span>
            <b className="text-slate-500 text-base">{notReported.offShmp.count}</b>
            <span className="text-[10px] text-slate-400">{copied === "nr_off" ? "✓" : `📋${notReported.offShmp.pns.length}`}</span>
          </button>
          {/* סטטוסים */}
          {statuses.map((st) => (
            <button key={st.id} onClick={() => copyPns(st.id, st.pns)} disabled={st.pns.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50">
              <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: st.color }} />
              <span className="text-slate-700">{st.icon} {st.name}</span>
              <b className="text-slate-900 text-base">{st.count}</b>
              <span className="text-[10px] text-slate-400">{copied === st.id ? "✓" : `📋${st.pns.length}`}</span>
            </button>
          ))}
        </div>
      </div>

      {/* בלוק סטטוס פלוגות + נעילה — שורה אחת קומפקטית (לחיצה = נעילה/פתיחה) */}
      <div>
        <h3 className="font-bold text-slate-700 text-sm mb-2">🏢 סטטוס דיווח פלוגות (שמ״פ) — לחיצה נועלת/פותחת</h3>
        <div className="flex flex-wrap gap-2 items-stretch">
          {companies.filter((c) => c.total > 0).map((c) => {
            const full = c.shmp > 0 ? c.shmpReported >= c.shmp : c.reported >= c.total;
            const someReport = c.reported > 0;
            const bg = c.locked ? "bg-purple-50 border-purple-300" : full ? "bg-emerald-50 border-emerald-300" : someReport ? "bg-amber-50 border-amber-300" : "bg-slate-50 border-slate-200";
            return (
              <button key={c.id} onClick={() => lock(c.id, !c.locked)} disabled={pending}
                title={c.locked ? "נעול — לחץ לפתיחה" : "לחץ לנעילה"}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm hover:brightness-95 disabled:opacity-50 ${bg}`}>
                <span className="text-base">{c.locked ? "🔒" : full ? "🟢" : someReport ? "🟡" : "⚪"}</span>
                <span className="font-bold text-slate-800">{c.name}</span>
                <span className="text-xs text-slate-500">שמ״פ <b>{c.shmpReported}/{c.shmp}</b> · {c.reported}/{c.total}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* בלוק טבלה מצטברת — רצף יומי לפי תעסוקה */}
      <div>
        <h3 className="font-bold text-slate-700 text-sm mb-2">📈 רצף נוכחות מצטבר</h3>
        <Card className="p-3">
          {/* בורר טווח */}
          <div className="flex gap-2 flex-wrap items-center mb-3">
            <span className="text-xs text-slate-400">טווח ידני:</span>
            <input type="date" defaultValue={range.start} onChange={(e) => e.target.value && pushRange({ from: e.target.value, to: range.end })}
              className="border border-slate-300 rounded-lg px-2 py-1 text-sm" />
            <span className="text-xs text-slate-400">→</span>
            <input type="date" defaultValue={range.end} onChange={(e) => e.target.value && pushRange({ from: range.start, to: e.target.value })}
              className="border border-slate-300 rounded-lg px-2 py-1 text-sm" />
            <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1 text-sm">
              <option value="">כל הפלוגות</option>
              {companyNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <a href={`/roster/control/export?from=${range.start}&to=${range.end}`}
              className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg px-3 py-1 text-sm font-medium">
              📥 הורד אקסל (חיילים ודיווחים)
            </a>
            <span className="text-xs text-slate-400">{days.length} ימים · {filteredAgg.length} חיילים · אחוזים מתוך ימי שמ״פ</span>
          </div>

          <div className="overflow-x-auto -mx-3 px-3">
            <table className="text-xs border-separate" style={{ borderSpacing: 0 }}>
              <thead>
                <tr className="text-slate-500">
                  <th className="sticky right-0 z-10 bg-white px-2 py-1 text-right border-b border-slate-200 min-w-[9rem]">חייל</th>
                  {days.map((d) => (
                    <th key={d} className="px-0.5 py-1 text-center border-b border-slate-200 font-normal" style={{ minWidth: 22 }}>
                      <div className="text-[9px] text-slate-400">{dow(d)}</div>
                      <div className="text-[9px]">{dayLabel(d)}</div>
                    </th>
                  ))}
                  <th className="px-2 py-1 text-center border-b border-slate-200 border-r-2 border-r-slate-200">סיכום</th>
                </tr>
              </thead>
              <tbody>
                {filteredAgg.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="sticky right-0 z-10 bg-white hover:bg-slate-50 px-2 py-1 border-b border-slate-100 whitespace-nowrap">
                      <button onClick={() => setPopupSoldier(r)} className="text-slate-800 hover:text-indigo-600 hover:underline text-right">
                        {r.name}
                      </button>
                      <div className="text-[9px] text-slate-400">{r.company}</div>
                    </td>
                    {r.cells.map((sid, i) => {
                      const st = sid ? statusById.get(sid) : null;
                      const active = r.shmp[i];
                      return (
                        <td key={i} className="px-0.5 py-1 text-center border-b border-slate-100" title={`${days[i]}${st ? " · " + st.name : ""}${active ? "" : " · מחוץ לשמ״פ"}`}>
                          {st ? (
                            <span className="inline-block w-3.5 h-3.5 rounded-full" style={{ backgroundColor: st.color }} />
                          ) : active ? (
                            <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-rose-300" />
                          ) : (
                            <span className="text-slate-200">·</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 border-b border-slate-100 border-r-2 border-r-slate-200 whitespace-nowrap">
                      <div className="flex gap-1 flex-wrap justify-end">
                        {r.counts.length === 0 ? <span className="text-slate-300">—</span> : r.counts.map((c) => {
                          const st = statusById.get(c.statusId);
                          return (
                            <span key={c.statusId} className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px]" style={{ backgroundColor: (st?.color ?? "#999") + "22", color: st?.color ?? "#333" }} title={st?.name}>
                              <b>{c.n}</b>·{c.pct}%
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* מקרא */}
          <div className="flex gap-3 flex-wrap mt-3 text-[10px] text-slate-500 items-center">
            {statuses.map((st) => (
              <span key={st.id} className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: st.color }} />{st.name}
              </span>
            ))}
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block border-2 border-rose-300" />בשמ״פ · לא דיווח</span>
            <span className="inline-flex items-center gap-1"><span className="text-slate-300">·</span> מחוץ לשמ״פ</span>
          </div>
        </Card>
      </div>

      {/* פופאפ רצף פר-חייל */}
      {popupSoldier && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setPopupSoldier(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 p-4 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-800">{popupSoldier.name}</div>
                <div className="text-xs text-slate-400 font-mono">{popupSoldier.pn} · {popupSoldier.company}</div>
              </div>
              <button onClick={() => setPopupSoldier(null)} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
            </div>
            <div className="p-4">
              {/* סיכום */}
              <div className="flex gap-1.5 flex-wrap mb-3">
                <span className="text-xs bg-slate-100 rounded-lg px-2 py-1">שמ״פ: <b>{popupSoldier.shmpDays}</b> ימים</span>
                <span className="text-xs bg-slate-100 rounded-lg px-2 py-1">דיווחו: <b>{popupSoldier.reportedDays}</b></span>
                {popupSoldier.counts.map((c) => {
                  const st = statusById.get(c.statusId);
                  return <span key={c.statusId} className="text-xs rounded-lg px-2 py-1" style={{ backgroundColor: (st?.color ?? "#999") + "22", color: st?.color ?? "#333" }}>{st?.icon} {st?.name}: <b>{c.n}</b> ({c.pct}%)</span>;
                })}
              </div>
              {/* רצף יומי */}
              <div className="space-y-0.5">
                {days.map((d, i) => {
                  const sid = popupSoldier.cells[i];
                  const st = sid ? statusById.get(sid) : null;
                  const active = popupSoldier.shmp[i];
                  return (
                    <div key={d} className={`flex items-center justify-between text-sm px-2 py-1 rounded ${!active ? "opacity-40" : st ? "" : "bg-rose-50"}`}>
                      <span className="text-slate-500 text-xs w-24">{dow(d)}׳ {dayLabel(d)}</span>
                      {st ? (
                        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: st.color }} />{st.icon} {st.name}</span>
                      ) : active ? (
                        <span className="text-rose-500 text-xs">לא דיווח</span>
                      ) : (
                        <span className="text-slate-300 text-xs">מחוץ לשמ״פ</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
