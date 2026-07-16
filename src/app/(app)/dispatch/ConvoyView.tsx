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

/** רצועת שיירה — כרטיס פר-רכב עם דגל-גדוד/🔶, אייקון, סוג ומספר זיהוי (קריאה-בלבד, זהה לעורך). */
export function ConvoyStrip({ vehicles, battalionLogo = null }: {
  vehicles: { isExternal: boolean; typeName: string; ident: string | null }[];
  battalionLogo?: string | null;
}) {
  if (vehicles.length === 0) return null;
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {vehicles.map((v, i) => (
        <div key={i} className="flex flex-col items-center rounded-lg border border-slate-300 bg-white px-2 py-1 min-w-[76px]"
          title={`רכב ${i + 1} · ${v.typeName} · ${v.ident ?? "—"}`}>
          <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
            {!v.isExternal && (battalionLogo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={battalionLogo} alt="גדוד" title="רכב הגדוד" className="w-3.5 h-3.5 object-contain rounded-sm bg-white" />
              : <span title="רכב הגדוד">🚩</span>)}
            רכב {i + 1}
          </span>
          <span className="text-2xl leading-none">{vehicleIcon(v.typeName)}</span>
          <span className="text-[10px] font-semibold text-slate-700 mt-0.5 max-w-[72px] truncate" title={v.typeName}>{v.typeName}</span>
          <span className="text-[9px] text-slate-500 max-w-[72px] truncate" title={v.ident ?? ""}>{v.isExternal ? "🔶 " : ""}{v.ident ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}
