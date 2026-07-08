import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
const NUMS = ["45401301","45401286","45402495","45402498","45401275","45401279","45402497","45401290","45401294","45402436","45401276","45401340","45401143","45401289","45401319","45401343","45401349","45401282","45401295","45401287","45401323","25102317","25102355","25102036","25102346","25100238","25102245","25102109","25101385","25101008","25102349","25102264","25102330","25100813","25102265","25102133","25101503","25102125","25101085","25102253","25102136","25101386","25101526","25101045","25102763","25102142","25101543","25100858","25101484","25102135","25102239","25100015","25102266","25102255","25102429","25102147","25101394","25102302","25102406","25101510","25100981","25102100","25101502","25102470","25102023","25101174","66084569","7201867","68000391","68000371","70000937","7202767","68000732","68000286","6203199","72026669","231826","231845","231832","39425","39429","39430"];
async function main() {
  const bat = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true } });
  const units = await p.serialUnit.findMany({ where: { battalionId: bat!.id, serialNumber: { in: NUMS } }, select: { serialNumber: true, itemType: { select: { name: true } } } });
  const byItem = new Map<string, number>();
  for (const u of units) byItem.set(u.itemType.name, (byItem.get(u.itemType.name) ?? 0) + 1);
  console.log("=== נמצאו במערכת לפי פריט ===");
  for (const [name, c] of [...byItem.entries()].sort((a,b)=>b[1]-a[1])) console.log(`  ${name}: ${c}`);
  const found = new Set(units.map(u=>u.serialNumber));
  console.log("\n=== לא נמצאו (" + NUMS.filter(n=>!found.has(n)).length + ") ===");
  console.log("  " + NUMS.filter(n=>!found.has(n)).join(", "));
}
main().then(()=>p.$disconnect());
