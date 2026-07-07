import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
async function main() {
  const bat = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true, name: true } });
  const existing = await p.attendanceStatus.findFirst({ where: { battalionId: bat!.id, name: "מחלה" }, select: { id: true, icon: true } });
  if (existing) {
    if (existing.icon !== "🏥") {
      await p.attendanceStatus.update({ where: { id: existing.id }, data: { icon: "🏥" } });
      console.log(`✅ עודכן אייקון 🏥 לסטטוס "מחלה" הקיים`);
    } else console.log(`סטטוס "מחלה" כבר קיים עם אייקון 🏥 — מדלג`);
    return;
  }
  const maxSort = await p.attendanceStatus.aggregate({ where: { battalionId: bat!.id }, _max: { sortOrder: true } });
  const st = await p.attendanceStatus.create({
    data: { battalionId: bat!.id, name: "מחלה", color: "#ef4444", icon: "🏥", isPresent: false, sortOrder: (maxSort._max.sortOrder ?? 0) + 1, active: true },
  });
  console.log(`✅ נוצר סטטוס "מחלה" 🏥 (${bat!.name}) — ${st.id}`);
}
main().then(() => p.$disconnect()).catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
