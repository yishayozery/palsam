import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
async function main() {
  // תפקידי מערכת שיש להם armory=EDIT (מאשרים בפועל היום)
  const roles = await p.systemRole.findMany({ where: { permissions: { some: { screen: "armory", level: "EDIT" } } }, select: { id: true, name: true, battalionId: true } });
  const roleIds = roles.map((r) => r.id);
  const res = await p.appUser.updateMany({
    where: { OR: [{ systemRoleId: { in: roleIds } }, { role: "BATTALION_ADMIN" }, { role: "SUPER_ADMIN" }] },
    data: { canApproveWeapons: true },
  });
  console.log(`✅ הופעל canApproveWeapons ל-${res.count} משתמשים (מאשרים קיימים — שמירת המשכיות).`);
  // דיווח לגדסם 4
  const bat = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true } });
  const g4 = await p.appUser.findMany({ where: { battalionId: bat!.id, canApproveWeapons: true }, select: { fullName: true, username: true, systemRole: { select: { name: true } } } });
  console.log(`\nבגדסם 4 מורשים לאשר נשק (${g4.length}):`);
  for (const u of g4) console.log(`  • ${u.fullName} (@${u.username}) — ${u.systemRole?.name ?? "—"}`);
}
main().then(() => p.$disconnect()).catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
