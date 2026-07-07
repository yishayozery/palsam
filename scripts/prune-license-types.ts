import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
async function main() {
  const bat = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true } });
  const types = await p.drivingLicenseType.findMany({
    where: { battalionId: bat!.id, active: true },
    select: { id: true, name: true, kind: true, _count: { select: { soldierLicenses: true, vehicleTypeLicenses: true } } },
  });
  // מועמדים להשבתה: היתר (PERMIT), 0 חיילים, 0 רכבים, ושם לא-מספרי (מספרים חשובים — נשמרים)
  const isNumeric = (s: string) => /^\d+$/.test(s.trim());
  const toDisable = types.filter((t) =>
    t.kind !== "LICENSE" &&
    t._count.soldierLicenses === 0 &&
    t._count.vehicleTypeLicenses === 0 &&
    !isNumeric(t.name)
  );
  if (toDisable.length === 0) { console.log("אין מועמדים להשבתה."); return; }
  console.log(`משבית ${toDisable.length} היתרים לא-בשימוש (הפיך — active=false):`);
  for (const t of toDisable) console.log(`  • ${t.name}`);
  await p.drivingLicenseType.updateMany({ where: { id: { in: toDisable.map((t) => t.id) } }, data: { active: false } });
  const left = await p.drivingLicenseType.count({ where: { battalionId: bat!.id, active: true } });
  console.log(`\n✅ נותרו ${left} סוגים פעילים.`);
}
main().then(() => p.$disconnect()).catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
