/**
 * ♻️ סימולציית סגירת תעסוקה — קריאה בלבד, לא כותב כלום.
 *
 * מראה: בדיקת מוכנות, מה ייוצא לקובץ, מה יימחק, ומה יישאר.
 * להריץ לפני כל סגירה אמיתית.
 *
 *   npx tsx scripts/cycle-dry-run.ts --code 5222
 */
import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const CODE = arg("--code") ?? "5222";

async function main() {
  const b = await p.battalion.findUnique({ where: { code: CODE }, select: { id: true, name: true } });
  if (!b) { console.log(`אין גדוד עם קוד ${CODE}`); return; }
  const bId = b.id;
  console.log(`=== ${b.name} (${CODE}) — סימולציית סגירת תעסוקה ===\n`);

  // ── 1. מוכנות ──
  const [signedSerials, openCallups, pendingTransfers] = await Promise.all([
    p.serialUnit.count({ where: { battalionId: bId, signedSoldierId: { not: null } } }),
    p.callupPeriod.count({ where: { soldier: { battalionId: bId }, endDate: null } }),
    p.transfer.count({ where: { battalionId: bId, status: "PENDING" } }),
  ]);
  console.log("① מוכנות");
  const blockers: string[] = [];
  if (signedSerials) blockers.push(`ציוד סריאלי חתום: ${signedSerials}`);
  if (openCallups) blockers.push(`שמ"פ פתוח: ${openCallups}`);
  if (pendingTransfers) blockers.push(`תעודות ממתינות: ${pendingTransfers}`);
  if (blockers.length) { for (const x of blockers) console.log(`   ⛔ ${x}`); }
  else console.log("   ✅ נקי — אפשר לסגור");

  // ── 2. מה ייוצא ויימחק ──
  console.log("\n② מידע אישי — ייוצא לקובץ ואז יימחק");
  const personal: [string, Promise<number>][] = [
    ["חיילים", p.soldier.count({ where: { battalionId: bId } })],
    ["חתימות", p.signature.count({ where: { battalionId: bId } })],
    ["העברות", p.transfer.count({ where: { battalionId: bId } })],
    ["שורות העברה", p.transferLine.count({ where: { transfer: { battalionId: bId } } })],
    ["נוכחות (ביצוע)", p.attendanceRecord.count({ where: { soldier: { battalionId: bId } } })],
    ["נוכחות (תכנון)", p.attendancePlan.count({ where: { soldier: { battalionId: bId } } })],
    ["תקופות שמ\"פ", p.callupPeriod.count({ where: { soldier: { battalionId: bId } } })],
    ["צווי תחזית", p.forecastOrder.count({ where: { soldier: { battalionId: bId } } })],
    ["חריגי תחזית", p.forecastEntry.count({ where: { soldier: { battalionId: bId } } })],
    ["רישיונות נהיגה", p.soldierDrivingLicense.count({ where: { soldier: { battalionId: bId } } })],
    ["הסמכות", p.soldierCertification.count({ where: { soldier: { battalionId: bId } } })],
    ["תיקי נהג", p.driverForm.count({ where: { soldier: { battalionId: bId } } })],
  ];
  let personalTotal = 0;
  for (const [label, q] of personal) {
    const n = await q; personalTotal += n;
    console.log(`   ${String(n).padStart(6)}  ${label}`);
  }
  console.log(`   ${"—".repeat(6)}`);
  console.log(`   ${String(personalTotal).padStart(6)}  סה"כ רשומות`);

  // כמה מהן נושאות ביומטריה/תמונות
  const [withSig, withPhoto] = await Promise.all([
    p.soldier.count({ where: { battalionId: bId, weaponsAgreementSignature: { not: null } } }),
    p.soldier.count({ where: { battalionId: bId, licensePhotoData: { not: null } } }),
  ]);
  console.log(`\n   מתוכם רגישים במיוחד: ${withSig} חתימות אישיות · ${withPhoto} תמונות רישיון`);

  // ── 3. מה נשאר ──
  console.log("\n③ תחום הציוד — נשאר במערכת");
  const keep: [string, Promise<number>][] = [
    ["סוגי פריטים (קטלוג)", p.itemType.count({ where: { battalionId: bId } })],
    ["יחידות סריאליות", p.serialUnit.count({ where: { battalionId: bId } })],
    ["יתרות מלאי", p.stockBalance.count({ where: { battalionId: bId } })],
    ["מחסנים ופלוגות", p.holder.count({ where: { battalionId: bId } })],
    ["חוסרי ימ\"ח", p.ymachGap.count({ where: { battalionId: bId } })],
    ["מחלקות", p.squad.count({ where: { battalionId: bId } })],
    ["משתמשי מערכת", p.appUser.count({ where: { battalionId: bId } })],
  ];
  for (const [label, q] of keep) console.log(`   ${String(await q).padStart(6)}  ${label}`);

  // ── 4. נקודת החיבור הרגישה ──
  const gapsTotal = await p.ymachGap.count({ where: { battalionId: bId } });
  const gapsOpen = await p.ymachGap.count({ where: { battalionId: bId, status: "OPEN" } });
  console.log(`\n④ ⚠️ התנגשות שדורשת הכרעה`);
  console.log(`   YmachGap.soldierId הוא שדה חובה עם onDelete: Cascade.`);
  console.log(`   כלומר מחיקת החיילים תמחק בשקט ${gapsTotal} חוסרי ימ"ח (${gapsOpen} פתוחים),`);
  console.log(`   למרות שחוסר ימ"ח הוא נתון ציוד שדרשת שיישאר.`);
  console.log(`   נדרש שינוי סכמה: soldierId ל-optional + SetNull + שמירת שם כצילום.`);

  console.log(`\n(סימולציה בלבד — לא נכתב דבר)`);
}
main().finally(() => p.$disconnect());
