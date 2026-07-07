import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
const URL = "https://smartbase.digital.idf.il/#/home/profile?baseId=91";
async function main() {
  const g4 = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true } });
  const armory = await p.holder.findFirst({ where: { battalionId: g4!.id, warehouseType: "ARMORY" }, select: { id: true, name: true, armoryTestUrl: true } });
  if (!armory) throw new Error("אין מחסן ארמון בגדסם 4");
  await p.holder.update({ where: { id: armory.id }, data: { armoryTestUrl: URL } });
  console.log(`✅ קישור בוחן נשק הוגדר למחסן "${armory.name}" בגדסם 4:\n   ${URL}`);
}
main().then(() => p.$disconnect()).catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
