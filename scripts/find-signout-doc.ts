import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
async function main() {
  const bat = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true } });
  const t = await p.transfer.findFirst({ where: { battalionId: bat!.id, type: "SIGNOUT", toSoldierId: { not: null } }, orderBy: { createdAt: "desc" }, select: { id: true, toSoldier: { select: { fullName: true } }, createdBy: { select: { fullName: true } } } });
  console.log("transfer-doc id:", t?.id, "| מקבל:", t?.toSoldier?.fullName, "| מוסר:", t?.createdBy?.fullName);
}
main().then(()=>p.$disconnect());
