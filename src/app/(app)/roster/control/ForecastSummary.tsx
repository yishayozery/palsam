"use client";

import Link from "next/link";
import { Card } from "@/components/ui";

export type ForecastDay = {
  date: string;
  dayLabel: string;
  inService: number;
  absent: number;
  allocated: number | null;
};
export type ForecastReason = { name: string; icon: string; color: string; days: number };
export type ForecastCompany = { name: string; min: number; max: number; total: number };

/**
 * 📅 סיכום תחזית ההגעה לתעסוקה הנבחרת — לשלישות.
 * הנתון המרכזי הוא הבינארי בשמ"פ / לא בשמ"פ; הסיבות מוצגות כפילוח משני.
 */
export default function ForecastSummary({
  employmentId, employmentName, days, reasons, companies, soldierCount,
}: {
  employmentId: string | null; employmentName: string | null;
  days: ForecastDay[]; reasons: ForecastReason[]; companies: ForecastCompany[]; soldierCount: number;
}) {
  if (days.length === 0) {
    return (
      <Card className="p-4 mb-4">
        <div className="text-sm text-slate-500">אין תעסוקה נבחרת — לא ניתן להציג תחזית.</div>
      </Card>
    );
  }

  const counts = days.map((d) => d.inService);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const avg = Math.round(counts.reduce((a, b) => a + b, 0) / counts.length);
  const worst = days.find((d) => d.inService === min)!;
  const belowQuota = days.filter((d) => d.allocated !== null && d.inService < d.allocated);

  const tone = (d: ForecastDay) => {
    if (d.allocated !== null && d.allocated > 0) {
      if (d.inService >= d.allocated) return "bg-emerald-100 text-emerald-900";
      if (d.inService >= d.allocated * 0.85) return "bg-amber-100 text-amber-900";
      return "bg-rose-100 text-rose-900";
    }
    const pct = soldierCount ? d.inService / soldierCount : 0;
    if (pct >= 0.85) return "bg-emerald-100 text-emerald-900";
    if (pct >= 0.6) return "bg-lime-100 text-lime-900";
    if (pct >= 0.35) return "bg-amber-100 text-amber-900";
    return "bg-rose-100 text-rose-900";
  };

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <h3 className="font-bold text-slate-800">📅 תחזית הגעה{employmentName ? ` — ${employmentName}` : ""}</h3>
        <Link href={employmentId ? `/attendance/forecast?employmentId=${employmentId}` : "/attendance/forecast"}
          className="mr-auto text-xs text-blue-600 hover:underline">פירוט מלא וסימון ←</Link>
      </div>

      {/* מדדים ראשיים */}
      <div className="flex gap-2 flex-wrap mb-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-center">
          <div className="text-lg font-bold text-emerald-700">{avg}</div>
          <div className="text-[10px] text-emerald-600">ממוצע בשמ״פ</div>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-center" title={`ביום ${worst.date}`}>
          <div className="text-lg font-bold text-rose-700">{min}</div>
          <div className="text-[10px] text-rose-600">שפל · {worst.date.slice(5)}</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-center">
          <div className="text-lg font-bold text-slate-700">{max}</div>
          <div className="text-[10px] text-slate-500">שיא</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-center">
          <div className="text-lg font-bold text-slate-700">{soldierCount}</div>
          <div className="text-[10px] text-slate-500">סה״כ חיילים</div>
        </div>
        {belowQuota.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
            <div className="text-lg font-bold text-amber-700">{belowQuota.length}</div>
            <div className="text-[10px] text-amber-600">ימים מתחת לתקן</div>
          </div>
        )}
      </div>

      {/* פילוח סיבות ההיעדרות (ימי-חייל לאורך התעסוקה) */}
      {reasons.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-3">
          <span className="text-[11px] text-slate-500 self-center">סיבות (ימי-חייל):</span>
          {reasons.map((r) => (
            <span key={r.name} className="text-[11px] rounded-full px-2 py-1 border" style={{ borderColor: r.color, color: r.color }}>
              {r.icon} {r.name} · {r.days}
            </span>
          ))}
        </div>
      )}

      {/* רצועת תאריכים */}
      <div className="overflow-x-auto">
        <div className="flex gap-0.5 min-w-max">
          {days.map((d) => (
            <div key={d.date} className={`rounded px-1 py-1 text-center min-w-[34px] ${tone(d)}`} title={`${d.date} · בשמ״פ ${d.inService} · לא בשמ״פ ${d.absent}${d.allocated !== null ? ` · תקן ${d.allocated}` : ""}`}>
              <div className="text-[9px] opacity-70">{d.dayLabel}</div>
              <div className="text-xs font-bold">{d.inService}</div>
              {d.allocated !== null && <div className="text-[8px] opacity-60">/{d.allocated}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* לפי פלוגה */}
      {companies.length > 0 && (
        <div className="mt-3 flex gap-2 flex-wrap">
          {companies.map((c) => (
            <span key={c.name} className="text-[11px] bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
              🪖 {c.name}: <b>{c.min}–{c.max}</b> <span className="text-slate-400">מתוך {c.total}</span>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
