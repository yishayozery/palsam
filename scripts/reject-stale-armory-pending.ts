/**
 * ↩️ ביטול 3 תעודות ארמון ממתינות שהמציאות סותרת אחרי סנכרון דוח צלמים 20.07.
 *
 * שלוש תעודות SIGNOUT במצב PENDING (טרם הוחלו על היחידה), שה-signedSoldierId
 * בפועל שונה ממה שהתעודה מציעה. מכיוון שהן PENDING, ה-signedSoldierId כבר
 * משקף את האמת — לכן מבטלים את התעודה בלבד, לא נוגעים ביחידה.
 *
 * מאמת לפני כתיבה: (א) התעודה PENDING, (ב) המקור ארמון, (ג) היחידה כבר
 * במצב הנכון. אם משהו לא תואם — עוצר על אותה תעודה ולא מבטל.
 *
 *   npx tsx --env-file=.env scripts/reject-stale-armory-pending.ts [--apply]
 */
import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// serial → מי מחזיק בפועל (null = ארמון/לא חתום). מקור: הצלבת הדוח שהרצנו.
const TARGETS: { serial: string; expectSigned: string | null; label: string }[] = [
  { serial: "9413366", expectSigned: null, label: "בארמון (לא חתום)" },
  { serial: "5213140", expectSigned: null, label: "בארמון (לא חתום)" },
  { serial: "5039035", expectSigned: "עמית מוטרו", label: "חתום על עמית מוטרו" },
];

async function main() {
  const b = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true } });
  if (!b) throw new Error("אין גדוד 5554");
  console.log(`=== ${APPLY ? "⚠️ ביטול" : "סימולציה"} — 3 תעודות ארמון חורגות ===\n`);

  for (const t of TARGETS) {
    const unit = await p.serialUnit.findFirst({
      where: { battalionId: b.id, serialNumber: t.serial },
      select: { id: true, signedSoldier: { select: { fullName: true } } },
    });
    if (!unit) { console.log(`❌ ${t.serial}: יחידה לא נמצאה — דילוג`); continue; }
    const actual = unit.signedSoldier?.fullName ?? null;

    // אימות: היחידה כבר במצב הצפוי
    if (actual !== t.expectSigned) {
      console.log(`🛑 ${t.serial}: היחידה חתומה על "${actual ?? "— ארמון —"}" ולא על "${t.expectSigned ?? "— ארמון —"}" — עוצר, לא מבטל`);
      continue;
    }

    const tr = await p.transfer.findFirst({
      where: { battalionId: b.id, status: "PENDING", type: "SIGNOUT", lines: { some: { serialUnit: { serialNumber: t.serial } } } },
      select: { id: true, toSoldier: { select: { fullName: true } }, signaturePending: true, _count: { select: { signatures: true } } },
    });
    if (!tr) { console.log(`⚠️ ${t.serial}: אין תעודה PENDING תואמת — כנראה כבר טופלה`); continue; }

    console.log(`${APPLY ? "↩️" : "•"} ${t.serial}: תעודה→${tr.toSoldier?.fullName ?? "-"} | בפועל ${t.label} | ${tr._count.signatures} חתימות`);

    if (APPLY) {
      await p.$transaction(async (tx) => {
        await tx.signature.updateMany({ where: { transferId: tr.id }, data: { status: "CANCELED" } });
        await tx.transfer.update({ where: { id: tr.id }, data: { status: "REJECTED", signaturePending: false, notes: "בוטל — סתירה למצב בפועל (סנכרון דוח צלמים 20.07)" } });
      });
    }
  }
  console.log(`\n${APPLY ? "✅ הסתיים." : "(סימולציה — לא נכתב דבר)"}`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => p.$disconnect());
