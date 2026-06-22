"use client";

import { useTransition, useState, useRef, useCallback } from "react";
import { setVacationEntry } from "../actions";

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
  const [entries, setEntries] = useState(initialEntries);
  const [pending, startTransition] = useTransition();
  const [statusPicker, setStatusPicker] = useState<{ userId: string; date: string; x: number; y: number } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const canEdit = (userId: string) => isAdmin || (isAssigned && userId === currentUserId);

  const handleCellClick = useCallback((userId: string, date: string, e: React.MouseEvent) => {
    if (!canEdit(userId)) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setStatusPicker({ userId, date, x: rect.left, y: rect.bottom });
  }, [isAdmin, isAssigned, currentUserId]);

  const handleSetStatus = useCallback((statusId: string) => {
    if (!statusPicker) return;
    const { userId, date } = statusPicker;
    // optimistic update
    setEntries((prev) => {
      const next = { ...prev };
      if (!next[userId]) next[userId] = {};
      if (statusId) {
        next[userId] = { ...next[userId], [date]: statusId };
      } else {
        const { [date]: _, ...rest } = next[userId];
        next[userId] = rest;
      }
      return next;
    });
    setStatusPicker(null);

    const fd = new FormData();
    fd.set("boardId", boardId);
    fd.set("userId", userId);
    fd.set("date", date);
    fd.set("statusId", statusId);
    startTransition(async () => {
      await setVacationEntry(fd);
    });
  }, [statusPicker, boardId]);

  // קיבוץ ימים לפי חודש
  const months: { label: string; days: string[] }[] = [];
  for (const day of days) {
    const d = new Date(day + "T00:00:00");
    const label = d.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
    let m = months.find((x) => x.label === label);
    if (!m) { m = { label, days: [] }; months.push(m); }
    m.days.push(day);
  }

  // סיכום לכל סטטוס
  const summaryByStatus = statuses.map((s) => {
    let count = 0;
    for (const userId of Object.keys(entries)) {
      for (const dateStr of Object.keys(entries[userId] || {})) {
        if (entries[userId][dateStr] === s.id) count++;
      }
    }
    return { ...s, count };
  });

  return (
    <div>
      {/* מקרא */}
      <div className="flex flex-wrap gap-3 mb-4">
        {statuses.map((s) => (
          <div key={s.id} className="flex items-center gap-1.5 text-sm">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: s.color }} />
            <span>{s.icon} {s.name}</span>
            <span className="text-xs text-slate-400">({summaryByStatus.find((x) => x.id === s.id)?.count || 0})</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-sm text-slate-400">
          <div className="w-4 h-4 rounded bg-slate-100 border border-slate-200" />
          <span>לא עודכן</span>
        </div>
      </div>

      <div ref={tableRef} className="overflow-x-auto bg-white rounded-xl border border-slate-200">
        <table className="min-w-full text-xs">
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
                    className={`px-1 py-1 text-center border-b min-w-[36px] ${isWeekend ? "bg-slate-100" : ""}`}
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
                  const statusId = entries[u.id]?.[day];
                  const status = statusId ? statuses.find((s) => s.id === statusId) : null;
                  const editable = canEdit(u.id);

                  return (
                    <td
                      key={day}
                      onClick={(e) => editable && handleCellClick(u.id, day, e)}
                      className={`px-0.5 py-1 text-center border-b border-l transition ${
                        isWeekend ? "bg-slate-50" : ""
                      } ${editable ? "cursor-pointer hover:ring-2 hover:ring-blue-300 hover:z-10" : ""}`}
                      style={status ? { backgroundColor: status.color + "30" } : undefined}
                      title={status ? `${status.name} — ${u.fullName}` : `${day} — ${u.fullName}`}
                    >
                      {status ? (
                        <span className="text-[11px]" style={{ color: status.color }}>
                          {status.icon || status.name.charAt(0)}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* סיכום שורת חושב */}
      <div className="mt-3 text-xs text-slate-500">
        {pending && <span className="text-blue-600">שומר...</span>}
      </div>

      {/* Status picker popover */}
      {statusPicker && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setStatusPicker(null)}
        >
          <div
            className="absolute bg-white rounded-xl shadow-xl border p-2 space-y-1 min-w-[140px]"
            style={{ left: statusPicker.x, top: statusPicker.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {statuses.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSetStatus(s.id)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 text-sm text-right"
              >
                <span className="w-3 h-3 rounded" style={{ backgroundColor: s.color }} />
                <span>{s.icon} {s.name}</span>
              </button>
            ))}
            <button
              onClick={() => handleSetStatus("")}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-red-50 text-sm text-slate-400"
            >
              <span className="w-3 h-3 rounded bg-slate-200" />
              נקה
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
