/**
 * שחזור דגלי נשק שנמחקו ע"י הבאג "איפוס בזיכוי" (תוקן ב-fadad3b).
 * משחזר את חותמות-הזמן מתוך ה-audit log. קבצי החתימה/התמונה אינם ניתנים לשחזור.
 * ריצה יבשה כברירת מחדל; --apply כדי לכתוב.
 */
import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
const APPLY = process.argv.includes("--apply");
/** --pn 8510491 — הגבלה לחייל אחד */
const ONLY_PN = (() => { const i = process.argv.indexOf("--pn"); return i >= 0 ? process.argv[i + 1] : null; })();

async function main() {
  const resets = await p.auditLog.findMany({
    where: { action: "RESET_WEAPONS_FLAGS", entity: "Soldier" },
    orderBy: { createdAt: "asc" },
    select: { entityId: true, createdAt: true },
  });
  const soldierIds = [...new Set(resets.map((r) => r.entityId!).filter(Boolean))];
  console.log(`נמצאו ${resets.length} אירועי איפוס על ${soldierIds.length} חיילים\n`);

  for (const sid of soldierIds) {
    const s = await p.soldier.findUnique({
      where: { id: sid },
      select: {
        fullName: true, personalNumber: true, status: true,
        company: { select: { name: true } },
        weaponsApprovedAt: true, armoryTestProofAt: true, weaponsAgreementSignedAt: true,
      },
    });
    if (!s) { console.log(`⚠️  ${sid} — חייל לא נמצא`); continue; }
    if (ONLY_PN && s.personalNumber !== ONLY_PN) continue;

    // האירועים המקוריים לפני האיפוס
    const logs = await p.auditLog.findMany({
      where: { entityId: sid, action: { in: ["ARMORY_TEST_PROOF_UPLOAD", "WEAPONS_AGREEMENT_SIGNED"] } },
      orderBy: { createdAt: "desc" },
      select: { action: true, createdAt: true },
    });
    const lastTest = logs.find((l) => l.action === "ARMORY_TEST_PROOF_UPLOAD")?.createdAt ?? null;
    const lastAgree = logs.find((l) => l.action === "WEAPONS_AGREEMENT_SIGNED")?.createdAt ?? null;

    const data: Record<string, Date> = {};
    if (!s.armoryTestProofAt && lastTest) data.armoryTestProofAt = lastTest;
    if (!s.weaponsAgreementSignedAt && lastAgree) data.weaponsAgreementSignedAt = lastAgree;

    const label = `${s.fullName} (${s.personalNumber ?? "—"} · ${s.company?.name ?? "—"} · ${s.status})`;
    if (Object.keys(data).length === 0) {
      console.log(`✔️  ${label} — אין מה לשחזר`);
      continue;
    }
    console.log(`🔧 ${label}`);
    if (data.armoryTestProofAt) console.log(`     מבחן ארמון  → ${data.armoryTestProofAt.toISOString()}`);
    if (data.weaponsAgreementSignedAt) console.log(`     חתימת נוהל → ${data.weaponsAgreementSignedAt.toISOString()}`);
    if (APPLY) {
      await p.soldier.update({ where: { id: sid }, data });
      console.log(`     ✅ עודכן`);
    }
  }
  if (!APPLY) console.log(`\n(ריצה יבשה — הרץ עם --apply כדי לכתוב)`);
}
main().finally(() => p.$disconnect());
