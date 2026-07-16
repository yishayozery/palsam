"use client";

// מיפוי סוג רכב (טקסט חופשי) → אימוג'י. ברירת מחדל 🚗.
// 2 קבוצות עיקריות: משאיות (🚛 — FMTV/אושקוש/משאית) ורכב (🚗/🚙).
// הסדר קובע — כללי תת-סוג ספציפיים לפני הכלל הגנרי (האמר → 🚙).
const ICONS: [RegExp, string][] = [
  [/משאית|טנדר|מטען|truck|fmtv|אושקוש|oshkosh|רם\b|reo/i, "🚛"],
  [/אמבולנס|רפוא|פינוי|נט"ן|נטן|ambulance/i, "🚑"],   // האמר פינוי / רפואי → אמבולנס
  [/פיקוד|מפקד|command/i, "🚙"],                        // האמר פיקוד
  [/קשר|שדר|comms/i, "🛰️"],                            // האמר קשר
  [/אוטובוס|באס|bus/i, "🚌"],
  [/טרקטור|מחפר|דחפור|d9|ד9/i, "🚜"],
  [/אופנוע|קטנוע|motor/i, "🏍️"],
  [/סיור|patrol/i, "🚓"],                               // האמר סיור → רכב סיור
  [/האמר|hummer|ג.?יפ|jeep|לנד|שטח|דוד|סופה/i, "🚙"],
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

/** 🚩 דגל גדוד מתנופף על מוט — מסמן רכב-גדוד בשיירה. */
export function BattalionFlag({ logo = null }: { logo?: string | null }) {
  return (
    <span className="conv-flag" title="רכב הגדוד">
      <span className="conv-flag-pole" />
      <span className="conv-flag-cloth">
        {logo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={logo} alt="דגל הגדוד" className="conv-flag-img" />
          : <span className="conv-flag-emoji">🚩</span>}
      </span>
    </span>
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
        <div key={i} className="flex flex-col items-center rounded-lg border border-slate-300 bg-white px-2 pb-1 pt-4 min-w-[76px]"
          title={`רכב ${i + 1} · ${v.typeName} · ${v.ident ?? "—"}`}>
          <span className="conv-veh">
            {!v.isExternal && <BattalionFlag logo={battalionLogo} />}
            <span className="text-2xl leading-none">{vehicleIcon(v.typeName)}</span>
          </span>
          <span className="text-[10px] text-slate-500">רכב {i + 1}</span>
          <span className="text-[10px] font-semibold text-slate-700 mt-0.5 max-w-[72px] truncate" title={v.typeName}>{v.typeName}</span>
          <span className="text-[9px] text-slate-500 max-w-[72px] truncate" title={v.ident ?? ""}>{v.isExternal ? "🔶 " : ""}{v.ident ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}
