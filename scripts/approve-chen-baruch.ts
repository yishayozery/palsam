import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
const SOLDIER_ID = "cmqqlzkdt006lv064eqqk4l2a"; // חן ברוך, מ.א 8246435, מפקדה (גדסם 4)
async function main() {
  const bat = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true } });
  const s = await p.soldier.findUnique({ where: { id: SOLDIER_ID }, select: { id: true, fullName: true, battalionId: true } });
  if (!s || s.battalionId !== bat!.id) throw new Error("חייל לא נמצא בגדסם 4");

  // מאשר: מג"ד/סמג"ד/מפ"מ/אדמין בגדוד (לצורך שיוך האישור)
  const approver = await p.appUser.findFirst({
    where: { battalionId: bat!.id, active: true, OR: [ { role: "BATTALION_ADMIN" }, { systemRole: { name: { in: ["מג\"ד", "סמג\"ד", "מפ\"מ"] } } } ] },
    select: { id: true, fullName: true },
  });

  const now = new Date();
  await p.soldier.update({
    where: { id: SOLDIER_ID },
    data: {
      weaponsApprovedAt: now,
      weaponsApprovedById: approver?.id ?? null,
      armoryTestProofAt: now,
      weaponsAgreementSignedAt: now,
    },
  });
  console.log(`✅ ${s.fullName} — סומן כזכאי לנשק (כל 3 השלבים). מאשר: ${approver?.fullName ?? "—"}`);

  const after = await p.soldier.findUnique({
    where: { id: SOLDIER_ID },
    select: { weaponsApprovedAt: true, armoryTestProofAt: true, weaponsAgreementSignedAt: true },
  });
  console.log(`   אישור חימוש: ${after!.weaponsApprovedAt ? "✅" : "❌"} | מבחן ארמון: ${after!.armoryTestProofAt ? "✅" : "❌"} | חתימת נוהל: ${after!.weaponsAgreementSignedAt ? "✅" : "❌"}`);
}
main().then(() => p.$disconnect()).catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
