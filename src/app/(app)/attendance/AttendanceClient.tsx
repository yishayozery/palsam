"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { saveAttendance, assignSquad } from "./actions";
import { upsertSquad, deleteSquad } from "../attendance-settings/actions";
import type { DayInfo } from "@/lib/hebrew-dates";

type SoldierRow = {
  id: string;
  fullName: string;
  personalNumber: string | null;
  squadId: string | null;
  squadName: string | null;
  enlistedAt: string | null;
  callupClosedAt: string | null;
};
type Squad = { id: string; name: string };
type Status = { id: string; name: string; color: string; icon: string | null; isPresent: boolean };
type AttEntry = { soldierId: string; date: string; statusId: string };

export default function AttendanceClient({
  companies, selectedCompanyId, soldiers, squads, statuses, days, plans, records, mode, canManage, startDate,
}: {
  companies: { id: string; name: string }[];
  selectedCompanyId: string;
  soldiers: SoldierRow[];
  squads: Squad[];
  statuses: Status[];
  days: DayInfo[];
  plans: AttEntry[];
  records: AttEntry[];
  mode: "plan" | "record";
  canManage: boolean;
  startDate: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Map<string, string | null>>(new Map());

  const data = mode === "plan" ? plans : records;

  const dataMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of data) m.set(`${d.soldierId}:${d.date}`, d.statusId);
    return m;
  }, [data]);

  const getStatus = useCallback(
    (soldierId: string, date: string): string | null => {
      const key = `${soldierId}:${date}`;
      if (pendingChanges.has(key)) return pendingChanges.get(key) ?? null;
      return dataMap.get(key) ?? null;
    },
    [dataMap, pendingChanges],
  );

  function cycleStatus(soldierId: string, date: string) {
    if (!canManage) return;
    const current = getStatus(soldierId, date);
    const idx = current ? statuses.findIndex((s) => s.id === current) : -1;
    const next = idx + 1 < statuses.length ? statuses[idx + 1].id : null;
    setPendingChanges((prev) => {
      const m = new Map(prev);
      m.set(`${soldierId}:${date}`, next);
      return m;
    });
  }

  function setStatusDirectly(soldierId: string, date: string, statusId: string | null) {
    if (!canManage) return;
    setPendingChanges((prev) => {
      const m = new Map(prev);
      m.set(`${soldierId}:${date}`, statusId);
      return m;
    });
  }

  async function handleSave() {
    if (pendingChanges.size === 0) return;
    setSaving(true);
    const entries = Array.from(pendingChanges.entries()).map(([key, statusId]) => {
      const [soldierId, date] = key.split(":");
      return { soldierId, date, statusId, type: mode };
    });
    await saveAttendance(entries);
    setPendingChanges(new Map());
    setSaving(false);
    router.refresh();
  }

  // Group soldiers by squad
  const grouped = useMemo(() => {
    const groups: { squad: Squad | null; soldiers: SoldierRow[] }[] = [];
    const noSquad: SoldierRow[] = [];
    const squadMap = new Map<string, SoldierRow[]>();
    for (const s of soldiers) {
      if (s.squadId) {
        const arr = squadMap.get(s.squadId) ?? [];
        arr.push(s);
        squadMap.set(s.squadId, arr);
      } else {
        noSquad.push(s);
      }
    }
    for (const sq of squads) {
      const arr = squadMap.get(sq.id);
      if (arr && arr.length > 0) groups.push({ squad: sq, soldiers: arr });
    }
    if (noSquad.length > 0) groups.push({ squad: null, soldiers: noSquad });
    return groups;
  }, [soldiers, squads]);

  // Attendance percentage per squad
  const today = new Date().toISOString().slice(0, 10);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; soldierId: string; date: string } | null>(null);
  const [showSquadMgr, setShowSquadMgr] = useState(false);
  const [newSquadName, setNewSquadName] = useState("");
  const [squadError, setSquadError] = useState<string | null>(null);
  const [squadSaving, setSquadSaving] = useState(false);

  function handleContextMenu(e: React.MouseEvent, soldierId: string, date: string) {
    e.preventDefault();
    if (!canManage) return;
    setCtxMenu({ x: e.clientX, y: e.clientY, soldierId, date });
  }

  // Navigate date range
  function shiftDays(offset: number) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + offset);
    const newStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    router.push(`?companyId=${selectedCompanyId}&start=${newStart}&mode=${mode}`);
  }

  const companyName = companies.find((c) => c.id === selectedCompanyId)?.name ?? "";

  // Compute presence stats for today
  const todayStat = useMemo(() => {
    let present = 0;
    let total = 0;
    for (const s of soldiers) {
      total++;
      const st = getStatus(s.id, today);
      if (st) {
        const status = statuses.find((x) => x.id === st);
        if (status?.isPresent) present++;
      }
    }
    return { present, total };
  }, [soldiers, statuses, getStatus, today]);

  return (
    <>
      {/* Mode toggle — prominent */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex rounded-xl overflow-hidden border-2 border-slate-200 text-sm font-bold">
          <a href={`?companyId=${selectedCompanyId}&start=${startDate}&mode=plan`}
            className={`px-5 py-2.5 flex items-center gap-2 transition-colors ${mode === "plan" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
            📝 תוכנית עבודה
          </a>
          <a href={`?companyId=${selectedCompanyId}&start=${startDate}&mode=record`}
            className={`px-5 py-2.5 flex items-center gap-2 transition-colors ${mode === "record" ? "bg-emerald-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
            ✅ ביצוע בפועל
          </a>
        </div>
        <div className={`text-xs rounded-lg px-3 py-1.5 ${mode === "plan" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>
          {mode === "plan" ? "מתכננים מראש את מצב הנוכחות" : "מדווחים על מצב בפועל"}
        </div>
      </div>

      {/* Controls */}
      <Card className="p-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          {companies.length > 1 && (
            <form method="GET" className="flex items-center gap-2">
              <input type="hidden" name="mode" value={mode} />
              <input type="hidden" name="start" value={startDate} />
              <label className="text-sm font-medium text-slate-700">פלוגה:</label>
              <select name="companyId" defaultValue={selectedCompanyId}
                onChange={(e) => (e.target.form as HTMLFormElement).submit()}
                className="rounded-lg border-2 border-slate-300 px-3 py-1.5 text-sm">
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </form>
          )}

          {/* Date navigation */}
          <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-1 border border-slate-200">
            <button onClick={() => shiftDays(-7)} className="rounded bg-white border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100 font-medium">◀ שבוע</button>
            <button onClick={() => shiftDays(-1)} className="rounded bg-white border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100">◀ יום</button>
            <button onClick={() => {
              const t = new Date();
              const s = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
              router.push(`?companyId=${selectedCompanyId}&start=${s}&mode=${mode}`);
            }} className="rounded bg-blue-600 text-white px-3 py-1 text-xs font-bold hover:bg-blue-700">📅 היום</button>
            <button onClick={() => shiftDays(1)} className="rounded bg-white border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100">יום ▶</button>
            <button onClick={() => shiftDays(7)} className="rounded bg-white border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100 font-medium">שבוע ▶</button>
          </div>

          <div className="text-sm text-slate-600 mr-auto flex items-center gap-2">
            <span className="font-medium">{companyName}</span>
            <span className="text-slate-300">|</span>
            <span>נוכחות היום: <b className="text-emerald-700">{todayStat.present}</b>/{todayStat.total}</span>
          </div>
        </div>
      </Card>

      {/* Squad management */}
      {canManage && (
        <div className="mb-3">
          <button onClick={() => setShowSquadMgr(!showSquadMgr)}
            className="text-xs text-slate-500 hover:text-slate-700 mb-1">
            {showSquadMgr ? "▲ הסתר ניהול מחלקות" : "▼ ניהול מחלקות"}
          </button>
          {showSquadMgr && (
            <Card className="p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-slate-700">🪖 מחלקות — {companyName}</h3>
              </div>
              {squadError && (
                <div className="bg-rose-50 text-rose-700 rounded px-2 py-1 text-xs mb-2">{squadError}
                  <button onClick={() => setSquadError(null)} className="mr-2 text-rose-400">✕</button>
                </div>
              )}
              <div className="flex flex-wrap gap-2 mb-2">
                {squads.map((sq) => (
                  <span key={sq.id} className="inline-flex items-center gap-1 bg-slate-100 rounded-lg px-2 py-1 text-xs">
                    {sq.name}
                    <button onClick={async () => {
                      if (!confirm(`למחוק את "${sq.name}"?`)) return;
                      const res = await deleteSquad(sq.id);
                      if (res?.error) { setSquadError(res.error); return; }
                      router.refresh();
                    }} className="text-rose-400 hover:text-rose-600 text-[10px]">✕</button>
                  </span>
                ))}
                {squads.length === 0 && <span className="text-xs text-slate-400">אין מחלקות</span>}
              </div>
              <div className="flex gap-2 items-center">
                <input value={newSquadName} onChange={(e) => setNewSquadName(e.target.value)}
                  placeholder="שם מחלקה חדשה" className="rounded border border-slate-300 px-2 py-1 text-sm flex-1 max-w-48" />
                <button disabled={squadSaving || !newSquadName.trim()} onClick={async () => {
                  setSquadSaving(true); setSquadError(null);
                  const fd = new FormData();
                  fd.append("companyId", selectedCompanyId);
                  fd.append("name", newSquadName.trim());
                  fd.append("sortOrder", String(squads.length));
                  const res = await upsertSquad(fd);
                  setSquadSaving(false);
                  if (res?.error) { setSquadError(res.error); return; }
                  setNewSquadName("");
                  router.refresh();
                }} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded px-3 py-1 text-xs disabled:opacity-50">
                  ＋ הוסף
                </button>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-3">
        {statuses.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 border"
            style={{ borderColor: s.color, color: s.color }}>
            {s.icon} {s.name}
          </span>
        ))}
      </div>

      {/* Matrix */}
      <Card className="overflow-x-auto">
        <table className="text-[11px] border-collapse w-full" onClick={() => setCtxMenu(null)}>
          <thead>
            {/* Day of week row */}
            <tr className="bg-slate-50">
              <th className="sticky right-0 bg-slate-50 z-20 text-right px-2 py-1 min-w-[140px] border-b border-slate-200" rowSpan={3}>חייל</th>
              {days.map((d) => (
                <th key={d.date + "-dow"} className={`text-center px-0.5 py-0.5 font-medium min-w-[32px] ${d.isShabbat ? "text-blue-600" : d.isHoliday ? "text-rose-600" : "text-slate-500"}`}>
                  {d.dayLabel}
                </th>
              ))}
            </tr>
            {/* Gregorian date row */}
            <tr className="bg-slate-50">
              {days.map((d) => (
                <th key={d.date + "-greg"} className={`text-center px-0.5 py-0.5 font-mono font-bold ${d.date === today ? "bg-blue-100 text-blue-800" : d.isShabbat || d.isHoliday ? "text-slate-400" : "text-slate-700"}`}>
                  {d.gregDay}
                </th>
              ))}
            </tr>
            {/* Hebrew date row */}
            <tr className="bg-slate-50 border-b-2 border-slate-200">
              {days.map((d) => (
                <th key={d.date + "-heb"} className="text-center px-0 py-0.5 text-[9px] text-slate-400 font-normal whitespace-nowrap" title={d.holiday ?? undefined}>
                  {d.holiday ? <span className="text-rose-500 font-bold" title={d.holiday}>{d.holiday.slice(0, 4)}</span> : d.hebrewDate.split(" ")[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map((g) => (
              <>
                {g.squad && (
                  <tr key={`sq-${g.squad.id}`}>
                    <td colSpan={days.length + 1} className="bg-slate-100 px-2 py-1 font-bold text-[10px] text-slate-600 border-t border-slate-200">
                      🪖 {g.squad.name}
                    </td>
                  </tr>
                )}
                {g.soldiers.map((soldier) => (
                  <tr key={soldier.id} className="border-b border-slate-50 hover:bg-blue-50/20">
                    <td className="sticky right-0 bg-white z-10 px-2 py-1.5 border-l border-slate-100">
                      <div className="font-medium text-slate-800 truncate max-w-[130px]">{soldier.fullName}</div>
                      {soldier.personalNumber && (
                        <div className="text-[9px] font-mono text-slate-400">{soldier.personalNumber}</div>
                      )}
                    </td>
                    {days.map((d) => {
                      const statusId = getStatus(soldier.id, d.date);
                      const status = statusId ? statuses.find((s) => s.id === statusId) : null;
                      const isPending = pendingChanges.has(`${soldier.id}:${d.date}`);
                      const isWeekend = d.isShabbat || d.isHoliday;
                      return (
                        <td
                          key={d.date}
                          onClick={() => cycleStatus(soldier.id, d.date)}
                          onContextMenu={(e) => handleContextMenu(e, soldier.id, d.date)}
                          className={`text-center cursor-pointer select-none transition-colors border-l border-slate-50
                            ${d.date === today ? "bg-blue-50" : isWeekend ? "bg-slate-50/50" : ""}
                            ${isPending ? "ring-2 ring-inset ring-amber-400" : ""}
                            hover:bg-slate-100`}
                          title={`${soldier.fullName} — ${d.date}${status ? ` — ${status.name}` : ""}`}
                        >
                          {status ? (
                            <span className="text-sm leading-none" style={{ color: status.color }}>
                              {status.icon || "●"}
                            </span>
                          ) : (
                            <span className="text-slate-200">·</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Context menu */}
      {ctxMenu && (
        <div
          className="fixed z-50 bg-white shadow-xl rounded-lg border border-slate-200 py-1 min-w-[120px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          {statuses.map((s) => (
            <button key={s.id} onClick={() => {
              setStatusDirectly(ctxMenu.soldierId, ctxMenu.date, s.id);
              setCtxMenu(null);
            }} className="w-full text-right px-3 py-1.5 text-xs hover:bg-slate-100 flex items-center gap-1.5">
              <span style={{ color: s.color }}>{s.icon || "●"}</span> {s.name}
            </button>
          ))}
          <hr className="my-1 border-slate-200" />
          <button onClick={() => {
            setStatusDirectly(ctxMenu.soldierId, ctxMenu.date, null);
            setCtxMenu(null);
          }} className="w-full text-right px-3 py-1.5 text-xs hover:bg-slate-100 text-slate-500">
            ✕ נקה
          </button>
        </div>
      )}

      {/* Save bar */}
      {pendingChanges.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-blue-700 text-white rounded-xl shadow-2xl px-6 py-3 flex items-center gap-4">
          <span className="text-sm">{pendingChanges.size} שינויים ממתינים</span>
          <button onClick={handleSave} disabled={saving}
            className="bg-white text-blue-700 font-bold rounded-lg px-4 py-1.5 text-sm hover:bg-blue-50 disabled:opacity-50">
            {saving ? "שומר..." : "💾 שמור"}
          </button>
          <button onClick={() => setPendingChanges(new Map())}
            className="text-blue-200 hover:text-white text-sm">
            ביטול
          </button>
        </div>
      )}
    </>
  );
}
