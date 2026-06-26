"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState } from "@/components/ui";

type DayEntry = {
  eventName: string;
  eventType: string;
  forceName: string;
  date: string;
  dateFmt: string;
  dayName: string;
  plannedTasks: string | null;
  actualTasks: string | null;
  approved: boolean;
  soldierCount: number;
};

type EventSummary = {
  id: string;
  name: string;
  type: string;
  startDateFmt: string;
  endDateFmt: string;
};

export default function MyScheduleView({
  entries,
  events,
}: {
  entries: DayEntry[];
  events: EventSummary[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState("");

  const today = new Date().toISOString().slice(0, 10);

  const grouped = new Map<string, DayEntry[]>();
  for (const e of entries) {
    if (filter && e.eventName !== filter) continue;
    const arr = grouped.get(e.date) ?? [];
    arr.push(e);
    grouped.set(e.date, arr);
  }
  const sortedDates = Array.from(grouped.keys()).sort();

  const eventNames = [...new Set(entries.map((e) => e.eventName))];

  return (
    <div className="space-y-4">
      {/* Events overview */}
      {events.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-bold text-slate-500">אירועים:</span>
          {events.map((ev) => (
            <button
              key={ev.id}
              onClick={() => router.push(`/vacation/schedule/${ev.id}`)}
              className="text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-3 py-1.5 hover:bg-blue-100 transition"
            >
              <span className="font-bold">{ev.name}</span>
              <span className="text-blue-500 mr-1">
                {ev.type === "PLUGATI" ? " 📋" : " 🏕️"}
              </span>
              <span className="text-[10px] text-blue-400">{ev.startDateFmt} — {ev.endDateFmt}</span>
            </button>
          ))}
        </div>
      )}

      {/* Filter */}
      {eventNames.length > 1 && (
        <div className="flex gap-2 items-center">
          <span className="text-xs text-slate-500">סינון:</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">כל האירועים</option>
            {eventNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      )}

      {/* Day-by-day timeline */}
      {sortedDates.length === 0 ? (
        <Card className="p-6">
          <EmptyState>
            {entries.length === 0
              ? "אין משימות מתוכננות עבורך כרגע"
              : "אין משימות התואמות את הסינון"}
          </EmptyState>
        </Card>
      ) : (
        sortedDates.map((date) => {
          const dayEntries = grouped.get(date)!;
          const isToday = date === today;
          const isPast = date < today;
          const sample = dayEntries[0];

          return (
            <Card key={date} className={`overflow-hidden ${isToday ? "ring-2 ring-blue-400" : ""}`}>
              <div className={`px-4 py-2.5 flex items-center gap-3 ${isToday ? "bg-blue-800 text-white" : isPast ? "bg-slate-600 text-white" : "bg-slate-800 text-white"}`}>
                <span className="text-lg font-bold">{sample.dateFmt}</span>
                <span className="text-sm text-slate-300">{sample.dayName}</span>
                {isToday && <span className="text-[10px] bg-blue-500 rounded-full px-2 py-0.5">היום</span>}
                {isPast && <span className="text-[10px] bg-slate-500 rounded-full px-2 py-0.5">עבר</span>}
              </div>

              <div className="divide-y divide-slate-100">
                {dayEntries.map((entry, i) => (
                  <div key={i} className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs rounded-full px-2 py-0.5 font-bold ${
                        entry.eventType === "PLUGATI"
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-amber-100 text-amber-700"
                      }`}>
                        {entry.eventType === "PLUGATI" ? "📋 לוז מפורט" : "🏕️ מקדים/מאסף"}
                      </span>
                      <span className="font-bold text-sm text-slate-800">{entry.eventName}</span>
                      <span className="text-xs text-slate-400">({entry.forceName})</span>
                      {entry.approved && (
                        <span className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 font-bold">✔ מאושר</span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {entry.plannedTasks && (
                        <div className="bg-slate-50 rounded-lg p-3">
                          <span className="text-xs font-bold text-slate-600 block mb-1">📝 משימות מתוכננות</span>
                          <div className="text-sm text-slate-700 whitespace-pre-line">{entry.plannedTasks}</div>
                        </div>
                      )}
                      {entry.actualTasks && (
                        <div className="bg-emerald-50/50 rounded-lg p-3">
                          <span className="text-xs font-bold text-emerald-700 block mb-1">✅ בוצע</span>
                          <div className="text-sm text-slate-700 whitespace-pre-line">{entry.actualTasks}</div>
                        </div>
                      )}
                    </div>

                    {entry.soldierCount > 0 && (
                      <div className="mt-2 text-xs text-slate-400">
                        👥 {entry.soldierCount} חיילים משובצים
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
