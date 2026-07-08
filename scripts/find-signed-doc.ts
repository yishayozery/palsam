import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
async function main() {
  const bat = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true } });
  const sig = await p.signature.findFirst({ where: { battalionId: bat!.id, status: "SIGNED", signatureData: { not: null }, transfer: { is: { type: "SIGNOUT" } } }, orderBy: { signedAt: "desc" }, select: { transferId: true, soldier: { select: { fullName: true } } } });
  console.log("signed transfer-doc id:", sig?.transferId, "| חייל:", sig?.soldier?.fullName);
}
main().then(()=>p.$disconnect());
