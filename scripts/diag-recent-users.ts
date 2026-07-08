import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
async function main() {
  const bat = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true } });
  const since = new Date("2026-07-06T00:00:00Z");
  const users = await p.appUser.findMany({
    where: { battalionId: bat!.id, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, username: true, fullName: true, role: true, createdAt: true, systemRoleId: true,
      holder: { select: { name: true, kind: true, warehouseType: true } },
      systemRole: { select: { name: true, permissions: { select: { screen: true, level: true } } } },
      assignedHolders: { select: { holder: { select: { name: true, warehouseType: true, kind: true } } } },
    },
  });
  console.log(`משתמשים שנוצרו מ-06/07 (${users.length}):`);
  for (const u of users) {
    const sig = u.systemRole?.permissions.find(x => x.screen === "signatures")?.level ?? "—";
    const stock = u.systemRole?.permissions.find(x => x.screen === "stock")?.level ?? "—";
    console.log(`\n• ${u.fullName} (@${u.username}) | legacyRole=${u.role} | systemRole=${u.systemRole?.name ?? "❌ אין"} (id=${u.systemRoleId ?? "null"})`);
    console.log(`   holder: ${u.holder?.name ?? "—"} [${u.holder?.warehouseType ?? u.holder?.kind ?? ""}] | assigned: ${u.assignedHolders.map(a=>a.holder.name).join(",")||"—"}`);
    console.log(`   signatures=${sig} | stock=${stock}`);
  }
}
main().then(() => p.$disconnect()).catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
