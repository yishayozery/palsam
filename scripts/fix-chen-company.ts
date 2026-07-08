import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
const CHEN = "cmqqlzkdt006lv064eqqk4l2a";
const MAFKADA = "cmqosihbp0004ih04q0yqgxa2";
async function main() {
  const before = await p.soldier.findUnique({ where: { id: CHEN }, select: { company: { select: { name: true } } } });
  await p.soldier.update({ where: { id: CHEN }, data: { companyId: MAFKADA } });
  const after = await p.soldier.findUnique({ where: { id: CHEN }, select: { fullName: true, company: { select: { name: true } }, squad: { select: { name: true } }, companyRole: { select: { name: true } } } });
  console.log(`✅ ${after!.fullName}: פלוגה "${before!.company?.name}" → "${after!.company?.name}" | מחלקה: ${after!.squad?.name} | תפקיד: ${after!.companyRole?.name}`);
}
main().then(() => p.$disconnect()).catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
