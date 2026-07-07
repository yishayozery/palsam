import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
async function main() {
  const bat = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true, name: true } });
  const cands = await p.soldier.findMany({
    where: { battalionId: bat!.id, OR: [ { fullName: { contains: "לחן" } }, { fullName: { contains: "ברוך" } } ] },
    select: {
      id: true, fullName: true, personalNumber: true, status: true,
      company: { select: { name: true } },
      weaponsApprovedAt: true, weaponsApprovedById: true, weaponsApprovalSignature: true,
      armoryTestProofImage: true, armoryTestProofAt: true,
      weaponsAgreementSignedAt: true, weaponsAgreementSignature: true,
    },
  });
  console.log(`מועמדים (${cands.length}):`);
  for (const s of cands) {
    console.log(`\n• ${s.fullName} | מ.א ${s.personalNumber ?? "—"} | ${s.company?.name ?? "—"} | ${s.status} | ${s.id}`);
    console.log(`   1) אישור חימוש: ${s.weaponsApprovedAt ? "✅ " + s.weaponsApprovedAt.toISOString().slice(0,10) : "❌"}`);
    console.log(`   2) מבחן ארמון: ${s.armoryTestProofAt ? "✅ " + s.armoryTestProofAt.toISOString().slice(0,10) : (s.armoryTestProofImage ? "✅ (image)" : "❌")}`);
    console.log(`   3) חתימת נוהל: ${s.weaponsAgreementSignedAt ? "✅ " + s.weaponsAgreementSignedAt.toISOString().slice(0,10) : "❌"}`);
  }
}
main().then(() => p.$disconnect()).catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
