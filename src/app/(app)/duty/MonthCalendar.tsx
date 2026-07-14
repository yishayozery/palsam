"use client";

import { useEffect, useState } from "react";

const DOW = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const pad = (n: number) => String(n).padStart(2, "0");

/** לוח-שנה חודשי — כל יום מסומן במספר המשבצות. לחיצה על יום מחזירה את התאריך. */
export default function MonthCalendar({ countByDate, onDayClick }: { countByDate: Record<string, number>; onDayClick: (date: string) => void }) {
  const [cur, setCur] = useState<{ y: number; m: number } | null>(null);
  useEffect(() => {
    if (cur) return;
    const t = setTimeout(() => {
      const dates = Object.keys(countByDate).sort();
      if (dates.length) { const [y, m] = dates[0].split("-").map(Number); setCur({ y, m: m - 1 }); }
      else { const d = new Date(); setCur({ y: d.getFullYear(), m: d.getMonth() }); }
    }, 0);
    return () => clearTimeout(t);
  }, [cur, countByDate]);

  if (!cur) return <div className="p-6 text-center text-slate-400">טוען לוח…</div>;
  const { y, m } = cur;
  const startDow = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const monthLabel = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(Date.UTC(y, m, 1)));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setCur({ y: m === 0 ? y - 1 : y, m: m === 0 ? 11 : m - 1 })} className="px-3 py-1 text-slate-500 hover:text-slate-800">▶ קודם</button>
        <span className="font-bold text-slate-700">{monthLabel}</span>
        <button onClick={() => setCur({ y: m === 11 ? y + 1 : y, m: m === 11 ? 0 : m + 1 })} className="px-3 py-1 text-slate-500 hover:text-slate-800">הבא ◀</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {DOW.map((d) => <div key={d} className="text-xs text-slate-400 font-medium pb-1">{d}</div>)}
        {cells.map((day, i) => {
          if (day == null) return <div key={i} />;
          const ds = `${y}-${pad(m + 1)}-${pad(day)}`;
          const cnt = countByDate[ds] ?? 0;
          return (
            <button key={i} onClick={() => onDayClick(ds)}
              className={`aspect-square rounded-lg border text-sm flex flex-col items-center justify-center transition ${cnt ? "bg-blue-50 border-blue-300 hover:bg-blue-100" : "border-slate-100 hover:bg-slate-50"}`}>
              <span className="font-medium">{day}</span>
              {cnt > 0 && <span className="text-[10px] text-blue-600 leading-tight">{cnt} משבצות</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
