import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
async function main() {
  const bat = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true } });
  const types = await p.drivingLicenseType.findMany({
    where: { battalionId: bat!.id },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, kind: true, active: true, _count: { select: { soldierLicenses: true, vehicleTypeLicenses: true } } },
  });
  const lic = types.filter((t) => t.kind === "LICENSE");
  const perm = types.filter((t) => t.kind !== "LICENSE");
  console.log(`\n=== רשיונות (LICENSE) — ${lic.length} ===`);
  for (const t of lic) console.log(`  [${t.active ? "✓" : "✗"}] ${t.name} | חיילים=${t._count.soldierLicenses} | רכבים=${t._count.vehicleTypeLicenses}`);
  console.log(`\n=== היתרים (PERMIT) — ${perm.length} ===`);
  for (const t of perm) console.log(`  [${t.active ? "✓" : "✗"}] ${t.name} | חיילים=${t._count.soldierLicenses} | רכבים=${t._count.vehicleTypeLicenses}`);
  console.log(`\nסה"כ: ${types.length}`);
}
main().then(() => p.$disconnect()).catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
