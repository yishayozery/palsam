/** מחזור הסטטוסים של תיק תקלה/טיפול לרכב — מהדיווח ועד ההחזרה לפלוגה. */
export const FAULT_STAGES: { key: string; label: string; short: string; tone: string }[] = [
  { key: "reported", label: "🔴 תקול בפלוגה", short: "תקול בפלוגה", tone: "bg-rose-100 text-rose-800" },
  { key: "pull-coord", label: "📋 מתואם משיכה", short: "מתואם משיכה", tone: "bg-amber-100 text-amber-800" },
  { key: "pulled", label: "🚚 נמשך", short: "נמשך", tone: "bg-amber-100 text-amber-800" },
  { key: "in-service", label: "🔧 בטיפול", short: "בטיפול", tone: "bg-orange-100 text-orange-800" },
  { key: "waiting-parts", label: "⏳ מחכה לחלפים", short: "מחכה לחלפים", tone: "bg-orange-100 text-orange-800" },
  { key: "post-check", label: "🔍 בבדיקה אחרי טיפול", short: "בבדיקה", tone: "bg-sky-100 text-sky-800" },
  { key: "returning", label: "↩️ בתהליך החזרה", short: "בתהליך החזרה", tone: "bg-sky-100 text-sky-800" },
  { key: "delivered", label: "✅ נמסר לפלוגה", short: "נמסר לפלוגה", tone: "bg-emerald-100 text-emerald-800" },
];
export const FAULT_STAGE_KEYS = FAULT_STAGES.map((s) => s.key);
export const CLOSED_STAGE = "delivered";
export function stageInfo(key: string) { return FAULT_STAGES.find((s) => s.key === key) ?? { key, label: key, short: key, tone: "bg-slate-100 text-slate-700" }; }
export function stageIndex(key: string) { return FAULT_STAGES.findIndex((s) => s.key === key); }
