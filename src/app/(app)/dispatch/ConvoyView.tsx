"use client";

// מיפוי סוג רכב (טקסט חופשי) → אימוג'י. ברירת מחדל 🚗.
// 2 קבוצות עיקריות: משאיות (🚛 — FMTV/אושקוש/משאית) ורכב (🚗/🚙).
const ICONS: [RegExp, string][] = [
  [/משאית|טנדר|מטען|truck|fmtv|אושקוש|oshkosh|רם\b|reo/i, "🚛"],
  [/אמבולנס|רפוא|ambulance/i, "🚑"],
  [/אוטובוס|באס|bus/i, "🚌"],
  [/טרקטור|מחפר|דחפור|d9|ד9/i, "🚜"],
  [/אופנוע|קטנוע|motor/i, "🏍️"],
  [/האמר|hummer|ג.?יפ|jeep|לנד|שטח|דוד|סופה|רכב פיקוד/i, "🚙"],
];
/** אימוג'י לפי סוג רכב — משותף לכל מסכי השבצ"ק. */
export function vehicleIcon(name: string): string {
  for (const [re, ic] of ICONS) if (re.test(name || "")) return ic;
  return "🚗";
}
const iconFor = vehicleIcon;

/** תצוגה ויזואלית של הרכב השיירה — אייקוני רכב מקובצים לפי סוג עם כמות. */
export default function ConvoyView({ vehicles, size = "md" }: { vehicles: { typeName: string }[]; size?: "sm" | "md" }) {
  if (vehicles.length === 0) return null;
  const groups = new Map<string, number>();
  for (const v of vehicles) groups.set(v.typeName || "רכב", (groups.get(v.typeName || "רכב") ?? 0) + 1);
  const cls = size === "sm" ? "text-lg" : "text-2xl";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {[...groups.entries()].map(([type, count]) => (
        <div key={type} className="flex items-center gap-1" title={`${count}× ${type}`}>
          <span className="flex">
            {Array.from({ length: count }).map((_, i) => (
              <span key={i} className={`${cls} leading-none`}>{iconFor(type)}</span>
            ))}
          </span>
          <span className="text-xs text-slate-500 whitespace-nowrap">{count}× {type}</span>
        </div>
      ))}
    </div>
  );
}
