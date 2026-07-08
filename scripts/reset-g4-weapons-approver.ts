import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
async function main() {
  const bat = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true } });
  // איפוס: כבה לכולם בגדסם 4
  await p.appUser.updateMany({ where: { battalionId: bat!.id }, data: { canApproveWeapons: false } });
  // ברירת מחדל: מפקדים (מג"ד/סמג"ד/מפ"מ) + אדמין
  const r = await p.appUser.updateMany({
    where: {
      battalionId: bat!.id,
      OR: [
        { role: { in: ["BATTALION_ADMIN", "SUPER_ADMIN"] } },
        { systemRole: { name: { in: ["מג\"ד", "סמג\"ד", "מפ\"מ"] } } },
        { systemRole: { isAdmin: true } },
      ],
    },
    data: { canApproveWeapons: true },
  });
  const on = await p.appUser.findMany({ where: { battalionId: bat!.id, canApproveWeapons: true }, select: { fullName: true, username: true, systemRole: { select: { name: true } }, role: true } });
  console.log(`✅ גדסם 4: אופס. כעת מורשים לאשר נשק (${on.length}):`);
  for (const u of on) console.log(`  • ${u.fullName} (@${u.username}) — ${u.systemRole?.name ?? u.role}`);
  console.log(`\n(השאר כבויים — מנהל המערכת יסמן ידנית מי עוד רשאי, דרך צ׳קבוקס בהקמת/עריכת משתמש.)`);
}
main().then(() => p.$disconnect()).catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
