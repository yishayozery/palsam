import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
async function main() {
  const bat = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true } });
  // משתמשים שנוצרו לאחרונה עם קשר למחסן
  const users = await p.appUser.findMany({
    where: { battalionId: bat!.id, role: "WAREHOUSE_MANAGER" },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true, username: true, fullName: true, role: true, createdAt: true, active: true, passwordSet: true,
      holderId: true, holder: { select: { name: true, kind: true, warehouseType: true } },
      systemRole: { select: { name: true, permissions: { select: { screen: true, level: true } } } },
      customRole: { select: { name: true } },
      assignedHolders: { select: { holder: { select: { name: true, kind: true, warehouseType: true } } } },
    },
  });
  console.log(`מנהלי מחסן (${users.length}):`);
  for (const u of users) {
    console.log(`\n=== ${u.fullName} (@${u.username}) | נוצר ${u.createdAt.toISOString().slice(0,10)} | active=${u.active} passwordSet=${u.passwordSet}`);
    console.log(`   holder ראשי: ${u.holder?.name ?? "—"} [${u.holder?.kind}/${u.holder?.warehouseType ?? ""}]`);
    console.log(`   assignedHolders: ${u.assignedHolders.map(a => `${a.holder.name}[${a.holder.warehouseType ?? a.holder.kind}]`).join(", ") || "—"}`);
    console.log(`   systemRole: ${u.systemRole?.name ?? "❌ אין!"} | customRole: ${u.customRole?.name ?? "—"}`);
    if (u.systemRole) {
      const sig = u.systemRole.permissions.find(x => x.screen === "signatures");
      const stock = u.systemRole.permissions.find(x => x.screen === "stock");
      console.log(`   signatures=${sig?.level ?? "❌ חסר"} | stock=${stock?.level ?? "❌ חסר"} | סה"כ מסכים=${u.systemRole.permissions.length}`);
    }
  }
}
main().then(() => p.$disconnect()).catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
