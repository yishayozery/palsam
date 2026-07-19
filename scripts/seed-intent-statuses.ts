/**
 * סטטוסי כוונה לתכנון מילואים — "לא מגיע" / "מתלבט".
 * שניהם isPresent=false כדי שלא ייספרו כמגיעים בתחזית ובאחוזי הנוכחות.
 * ריצה יבשה כברירת מחדל; --apply כדי ליצור. --code XXXX לגדוד אחר (ברירת מחדל 5554).
 */
import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const CODE = (() => { const i = process.argv.indexOf("--code"); return i >= 0 ? process.argv[i + 1] : "5554"; })();

const WANTED = [
  { name: "לא מגיע", icon: "🚫", color: "#dc2626", isPresent: false, sortOrder: 20 },
  { name: "מתלבט", icon: "❓", color: "#f59e0b", isPresent: false, sortOrder: 21 },
];

async function main() {
  const b = await p.battalion.findUnique({ where: { code: CODE }, select: { id: true, name: true } });
  if (!b) { console.log(`❌ אין גדוד עם קוד ${CODE}`); return; }
  console.log(`גדוד: ${b.name} (${CODE})\n`);
  for (const w of WANTED) {
    const existing = await p.attendanceStatus.findUnique({ where: { battalionId_name: { battalionId: b.id, name: w.name } } });
    if (existing) { console.log(`✔️  "${w.name}" כבר קיים (${existing.active ? "פעיל" : "כבוי"})`); continue; }
    console.log(`➕ "${w.name}" ${w.icon}`);
    if (APPLY) {
      await p.attendanceStatus.create({ data: { battalionId: b.id, ...w, active: true } });
      console.log(`   ✅ נוצר`);
    }
  }
  if (!APPLY) console.log(`\n(ריצה יבשה — הרץ עם --apply)`);
}
main().finally(() => p.$disconnect());
