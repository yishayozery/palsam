import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
async function main() {
  for (const code of ["5222", "5554"]) {
    const b = await p.battalion.findUnique({ where: { code }, select: { id: true, name: true, armoryTestUrl: true } });
    console.log(`\n=== ${b?.name} (${code}) ===`);
    console.log(`Battalion.armoryTestUrl = ${JSON.stringify(b?.armoryTestUrl)}`);
    const holders = await p.holder.findMany({
      where: { battalionId: b!.id, OR: [ { armoryTestUrl: { not: null } }, { warehouseType: "ARMORY" } ] },
      select: { name: true, warehouseType: true, armoryTestUrl: true, weaponsAgreementText: true },
    });
    for (const h of holders) console.log(`  Holder "${h.name}" [${h.warehouseType}] armoryTestUrl=${JSON.stringify(h.armoryTestUrl)} agreementText=${h.weaponsAgreementText ? "(יש)" : "—"}`);
  }
}
main().then(() => p.$disconnect()).catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
