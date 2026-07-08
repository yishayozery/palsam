import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
async function main() {
  const bat = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true } });
  const companies = await p.holder.findMany({ where: { battalionId: bat!.id, kind: "COMPANY", active: true }, select: { id: true, name: true } });
  console.log("=== פלוגות (COMPANY) ===");
  for (const c of companies) console.log(`  ${c.name}: ${c.id}`);
  const sq = await p.squad.findUnique({ where: { id: "cmqqlzf1h000rv064q97h3zkg" }, select: { name: true, companyId: true, company: { select: { name: true, kind: true } } } });
  console.log("\n=== מחלקת לוגיסטיקה (של חן) ===");
  console.log(JSON.stringify(sq, null, 2));
  // האם למפקדה יש מחלקת לוגיסטיקה?
  const mafkada = companies.find(c => c.name.includes("מפקדה"));
  if (mafkada) {
    const squads = await p.squad.findMany({ where: { companyId: mafkada.id, active: true }, select: { id: true, name: true } });
    console.log(`\n=== מחלקות במפקדה (${mafkada.id}) ===`);
    for (const s of squads) console.log(`  ${s.name}: ${s.id}`);
  }
}
main().then(() => p.$disconnect()).catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
