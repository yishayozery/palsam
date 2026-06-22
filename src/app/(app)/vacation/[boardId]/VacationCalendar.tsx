"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { saveVacationBatch } from "../actions";

type Status = { id: string; name: string; color: string; icon: string | null };
type User = { id: string; fullName: string; title: string | null };

const DAY_NAMES = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const SHABBAT = 6;
const FRIDAY = 5;

export default function VacationCalendar({
  boardId,
  days,
  users,
  statuses,
  entries: initialEntries,
  currentUserId,
  isAdmin,
  isAssigned,
}: {
  boardId: string;
  days: string[];
  users: User[];
  statuses: Status[];
  entries: Record<string, Record<string, string>>;
  currentUserId: string;
  isAdmin: boolean;
  isAssigned: boolean;
}) {
  const router = useRouter();
  const [pendingChanges, setPendingChanges] = useState<Map<string, string | null>>(new Map());
  const [saving, setSaving] = useState(false);

  const canEdit = useCallback(
    (userId: string) => isAdmin || (isAssigned && userId === currentUserId),
    [isAdmin, isAssigned, currentUserId],
  );

  const getStatus = useCallback(
    (userId: string, date: string): string | null => {
      const key = `${userId}:${date}`;
      if (pendingChanges.has(key)) return pendingChanges.get(key) ?? null;
      return initialEntries[userId]?.[date] ?? null;
    },
    [initialEntries, pendingChanges],
  );

  function cycleStatus(userId: string, date: string) {
    if (!canEdit(userId)) return;
    const current = getStatus(userId, date);
    const idx = current ? statuses.findIndex((s) => s.id === current) : -1;
    const next = idx + 1 < statuses.length ? statuses[idx + 1].id : null;
    setPendingChanges((prev) => {
      const m = new Map(prev);
      m.set(`${userId}:${date}`, next);
      return m;
    });
  }

  async function handleSave() {
    if (pendingChanges.size === 0) return;
    setSaving(true);
    const entries = Array.from(pendingChanges.entries()).map(([key, statusId]) => {
      const [userId, date] = key.split(":");
      return { boardId, userId, date, statusId };
    });
    await saveVacationBatch(entries);
    setPendingChanges(new Map());
    setSaving(false);
    router.refresh();
  }

  // סיכום פר יום — כמה זמינים (סטטוס ראשון = "זמין")
  const dailySummary = useMemo(() => {
    const summary: Record<string, Record<string, number>> = {};
    for (const day of days) {
      summary[day] = {};
      for (const s of statuses) summary[day][s.id] = 0;
      let total = 0;
      for (const u of users) {
        const sid = getStatus(u.id, day);
        if (sid && summary[day][sid] !== undefined) {
          summary[day][sid]++;
          total++;
        }
      }
      summary[day]._total = total;
      summary[day]._empty = users.length - total;
    }
    return summary;
  }, [days, users, statuses, getStatus]);

  // סיכום כולל
  const totalByStatus = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const s of statuses) totals[s.id] = 0;
    for (const day of days) {
      for (const s of statuses) totals[s.id] += dailySummary[day]?.[s.id] ?? 0;
    }
    return totals;
  }, [statuses, days, dailySummary]);

  return (
    <div>
      {/* מקרא */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        {statuses.map((s) => (
          <div key={s.id} className="flex items-center gap-1.5 text-sm">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: s.color }} />
            <span>{s.icon} {s.name}</span>
            <span className="text-xs text-slate-400">({totalByStatus[s.id] || 0})</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-sm text-slate-400">
          <div className="w-4 h-4 rounded bg-slate-100 border border-slate-200" />
          <span>לא עודכן</span>
        </div>
        <div className="text-xs text-slate-400 mr-4">לחיצה על תא = מעגל בין הסטטוסים</div>
      </div>

      <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky right-0 z-10 bg-slate-50 px-3 py-2 text-right font-medium text-slate-600 border-b min-w-[140px]">שם</th>
              {days.map((day) => {
                const d = new Date(day + "T00:00:00");
                const dow = d.getDay();
                const isWeekend = dow === SHABBAT || dow === FRIDAY;
                return (
                  <th
                    key={day}
                    className={`px-1 py-1.5 text-center border-b min-w-[40px] ${isWeekend ? "bg-slate-100" : ""}`}
                  >
                    <div className="text-[10px] text-slate-400">{DAY_NAMES[dow]}</div>
                    <div className={`font-bold ${isWeekend ? "text-slate-400" : ""}`}>{d.getDate()}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.id === currentUserId ? "bg-blue-50/30" : ""}>
                <td className="sticky right-0 z-10 bg-white px-3 py-2 border-b font-medium text-slate-700 whitespace-nowrap">
                  {u.fullName}
                  {u.title && <span className="text-[10px] text-slate-400 mr-1">({u.title})</span>}
                </td>
                {days.map((day) => {
                  const d = new Date(day + "T00:00:00");
                  const dow = d.getDay();
                  const isWeekend = dow === SHABBAT || dow === FRIDAY;
                  const statusId = getStatus(u.id, day);
                  const status = statusId ? statuses.find((ss) => ss.id === statusId) : null;
                  const editable = canEdit(u.id);
                  const isPending = pendingChanges.has(`${u.id}:${day}`);

                  return (
                    <td
                      key={day}
                      onClick={() => editable && cycleStatus(u.id, day)}
                      className={`px-1 py-2 text-center border-b border-l transition select-none min-w-[40px] min-h-[40px] ${
                        isWeekend ? "bg-slate-50" : ""
                      } ${editable ? "cursor-pointer hover:ring-2 hover:ring-blue-300 hover:z-10" : ""} ${
                        isPending ? "ring-1 ring-blue-400" : ""
                      }`}
                      style={{
                        ...(status ? { backgroundColor: status.color + "30" } : {}),
                        touchAction: "manipulation",
                      }}
                      title={status ? `${status.name} — ${u.fullName}` : `${day} — ${u.fullName}`}
                    >
                      {status ? (
                        <span className="text-[11px] font-medium" style={{ color: status.color }}>
                          {status.icon || status.name.charAt(0)}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {/* שורת סיכום */}
          <tfoot>
            {statuses.map((st) => (
              <tr key={st.id} className="bg-slate-50/50">
                <td className="sticky right-0 z-10 bg-slate-50 px-3 py-1.5 border-t text-[10px] font-medium whitespace-nowrap" style={{ color: st.color }}>
                  {st.icon} {st.name}
                </td>
                {days.map((day) => {
                  const count = dailySummary[day]?.[st.id] ?? 0;
                  return (
                    <td key={day} className="text-center border-t border-l text-[10px] py-1" style={{ color: count > 0 ? st.color : "#cbd5e1" }}>
                      {count > 0 ? count : "·"}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="bg-slate-100">
              <td className="sticky right-0 z-10 bg-slate-100 px-3 py-1.5 border-t text-[10px] font-bold text-slate-500 whitespace-nowrap">
                לא עודכן
              </td>
              {days.map((day) => {
                const empty = dailySummary[day]?._empty ?? 0;
                return (
                  <td key={day} className={`text-center border-t border-l text-[10px] font-bold py-1 ${empty > 0 ? "text-rose-500" : "text-slate-300"}`}>
                    {empty > 0 ? empty : "✓"}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* כפתור שמירה */}
      {pendingChanges.size > 0 && (
        <div className="sticky bottom-4 mt-4 flex justify-center">
          <div className="bg-white border border-blue-200 shadow-lg rounded-xl px-6 py-3 flex items-center gap-4">
            <span className="text-sm text-slate-600">{pendingChanges.size} שינויים ממתינים</span>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "שומר..." : "💾 שמור"}
            </button>
            <button
              onClick={() => setPendingChanges(new Map())}
              className="px-3 py-2 text-slate-500 hover:text-slate-700 text-sm"
            >
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
