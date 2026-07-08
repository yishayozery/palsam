import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
async function main() {
  const bat = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true } });
  const t = await p.dispatchTemplate.count({ where: { battalionId: bat!.id, active: true } });
  const withVehicle = await p.dispatchTemplate.count({ where: { battalionId: bat!.id, active: true, vehicleSerialUnitId: { not: null } } });
  const roles = await p.dispatchRole.count({ where: { battalionId: bat!.id } });
  console.log(`גדסם 4: תבניות שבצק קבוע=${t} (עם רכב=${withVehicle}) | תפקידי שבצק (DispatchRole)=${roles}`);
}
main().then(()=>p.$disconnect());
