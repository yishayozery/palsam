/**
 * סטטוסי תחזית הגעה (שלב הצווים, לפני התעסוקה).
 * `inService` הוא הבינארי שהגדוד סופר: בשמ"פ / לא בשמ"פ. השם הוא הסיבה.
 * מנקה גם את "לא מגיע"/"מתלבט" שנוספו בטעות ל-AttendanceStatus (שכבת הנוכחות).
 * ריצה יבשה כברירת מחדל; --apply לכתיבה. --code XXXX (ברירת מחדל 5554).
 */
import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const CODE = (() => { const i = process.argv.indexOf("--code"); return i >= 0 ? process.argv[i + 1] : "5554"; })();

const WANTED = [
  { name: "בשמ\"פ", icon: "🟢", color: "#059669", inService: true, sortOrder: 0 },
  { name: "חול", icon: "🏖️", color: "#0ea5e9", inService: false, sortOrder: 10 },
  { name: "לימודים", icon: "🎓", color: "#8b5cf6", inService: false, sortOrder: 11 },
  { name: "אישי", icon: "👤", color: "#f59e0b", inService: false, sortOrder: 12 },
  { name: "מחלה", icon: "🏥", color: "#ef4444", inService: false, sortOrder: 13 },
  { name: "מתלבט", icon: "❓", color: "#94a3b8", inService: false, sortOrder: 20 },
];

/** נוספו ב-commit קודם לשכבה הלא-נכונה (נוכחות במקום תחזית) */
const STRAY_ATTENDANCE = ["לא מגיע", "מתלבט"];

async function main() {
  const b = await p.battalion.findUnique({ where: { code: CODE }, select: { id: true, name: true } });
  if (!b) { console.log(`❌ אין גדוד עם קוד ${CODE}`); return; }
  console.log(`גדוד: ${b.name} (${CODE})\n— סטטוסי תחזית —`);

  for (const w of WANTED) {
    const existing = await p.forecastStatus.findUnique({ where: { battalionId_name: { battalionId: b.id, name: w.name } } });
    if (existing) { console.log(`✔️  "${w.name}" כבר קיים`); continue; }
    console.log(`➕ ${w.icon} ${w.name} — ${w.inService ? "בשמ\"פ" : "לא בשמ\"פ"}`);
    if (APPLY) await p.forecastStatus.create({ data: { battalionId: b.id, ...w, active: true } });
  }

  console.log(`\n— ניקוי סטטוסי נוכחות שנוספו בטעות —`);
  for (const name of STRAY_ATTENDANCE) {
    const st = await p.attendanceStatus.findUnique({ where: { battalionId_name: { battalionId: b.id, name } }, select: { id: true } });
    if (!st) { console.log(`✔️  "${name}" לא קיים`); continue; }
    const used = (await p.attendancePlan.count({ where: { statusId: st.id } }))
      + (await p.attendanceRecord.count({ where: { statusId: st.id } }));
    if (used > 0) { console.log(`⚠️  "${name}" בשימוש ב-${used} רשומות — מכבה במקום למחוק`); if (APPLY) await p.attendanceStatus.update({ where: { id: st.id }, data: { active: false } }); continue; }
    console.log(`🗑️  "${name}" — מוחק (לא בשימוש)`);
    if (APPLY) await p.attendanceStatus.delete({ where: { id: st.id } });
  }

  if (!APPLY) console.log(`\n(ריצה יבשה — הרץ עם --apply)`);
}
main().finally(() => p.$disconnect());
