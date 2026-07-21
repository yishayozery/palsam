/**
 * 🔍 אימות תוכן הגיבוי — קריאה בלבד, לא כותב כלום.
 *
 * עונה על שלוש שאלות לפני שטורחים על שחזור:
 *   1. מתי רץ הגיבוי האחרון, ויש בו data בכלל?
 *   2. האם הספירות בגיבוי תואמות למה שחי במסד עכשיו?
 *   3. מה **לא** מכוסה — הפער שנשען על Neon PITR.
 *
 *   npx tsx --env-file=.env scripts/backup-verify.ts
 */
import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();

/** טבלאות שהגיבוי הלוגי לא נוגע בהן — הרשת היחידה עליהן היא PITR. */
const NOT_COVERED: [string, () => Promise<number>][] = [
  ["משתמשי מערכת", () => p.appUser.count()],
  ["הרשאות מסך", () => p.screenPermission.count()],
  ["הסמכות חיילים", () => p.soldierCertification.count()],
  ["רישיונות נהיגה", () => p.soldierDrivingLicense.count()],
  ["חוסרי ימ\"ח", () => p.ymachGap.count()],
  ["ארגזים מבצעיים", () => p.operationalKit.count()],
  ["נוכחות (ביצוע)", () => p.attendanceRecord.count()],
  ["צווי תחזית", () => p.forecastOrder.count()],
  ["תיקי נהג", () => p.driverForm.count()],
];

async function main() {
  console.log("=== אימות גיבוי — קריאה בלבד ===\n");

  // ① הריצה האחרונה
  const runs = await p.backupRun.findMany({
    orderBy: { createdAt: "desc" }, take: 8,
    select: { id: true, createdAt: true, status: true, target: true, sizeBytes: true, rowCounts: true, error: true, data: true },
  });
  if (!runs.length) { console.log("🛑 אין אף ריצת גיבוי במסד."); return; }

  console.log("① ריצות אחרונות");
  for (const r of runs) {
    const icon = r.status === "OK" ? "✅" : r.status === "RUNNING" ? "⏳" : "❌";
    const kb = r.sizeBytes ? `${(r.sizeBytes / 1024).toFixed(0)}KB` : "—";
    const hasData = r.data ? "data✓" : "data✗";
    console.log(`   ${icon} ${r.createdAt.toISOString().slice(0, 16)}  ${String(r.target ?? "").padEnd(11)} ${kb.padStart(7)}  ${hasData}${r.error ? `  ⚠️ ${r.error.slice(0, 60)}` : ""}`);
  }

  const latest = runs.find((r) => r.status === "OK" && r.data);
  if (!latest?.data) { console.log("\n🛑 אין אף ריצה תקינה עם data — אין ממה לשחזר."); return; }

  const ageH = (Date.now() - latest.createdAt.getTime()) / 3_600_000;
  console.log(`\n   הגיבוי הישים האחרון: לפני ${ageH.toFixed(1)} שעות`);
  if (ageH > 24) console.log(`   ⚠️ מעל 24 שעות — ה-cron אולי לא רץ.`);

  // ② גיבוי מול חי
  const snap = JSON.parse(latest.data) as { version: number; tables: Record<string, unknown[]> };
  const t = snap.tables;
  console.log(`\n② תוכן הגיבוי מול המסד החי (גלובלי, כל הגדודים)`);
  const live: [string, keyof typeof t, () => Promise<number>][] = [
    ["חיילים", "soldiers", () => p.soldier.count()],
    ["יחידות סריאליות", "serialUnits", () => p.serialUnit.count()],
    ["חתימות", "signatures", () => p.signature.count()],
    ["העברות", "transfers", () => p.transfer.count()],
    ["שורות העברה", "transferLines", () => p.transferLine.count()],
    ["מחזיקים", "holders", () => p.holder.count()],
    ["יתרות מלאי", "stockBalances", () => p.stockBalance.count()],
    ["סוגי פריטים", "itemTypes", () => p.itemType.count()],
    ["גדודים", "battalions", () => p.battalion.count()],
    ["תקופות שמ\"פ", "callups", () => p.callupPeriod.count()],
  ];
  let drift = 0;
  for (const [label, key, q] of live) {
    const inBackup = (t[key] ?? []).length;
    const now = await q();
    const d = now - inBackup;
    if (d !== 0) drift++;
    const mark = d === 0 ? "✅" : d > 0 ? `↑${d}` : `↓${-d}`;
    console.log(`   ${String(inBackup).padStart(6)} בגיבוי | ${String(now).padStart(6)} חי  ${mark.padStart(6)}  ${label}`);
  }
  console.log(`\n   ${drift === 0 ? "✅ זהה לחלוטין" : `ℹ️ ${drift} טבלאות זזו מאז הגיבוי — צפוי אם המערכת בשימוש`}`);

  // ③ הפער
  console.log(`\n③ ⚠️ לא מכוסה בגיבוי הלוגי — נשען על Neon PITR בלבד`);
  let exposed = 0;
  for (const [label, q] of NOT_COVERED) {
    const n = await q().catch(() => -1);
    if (n > 0) exposed += n;
    console.log(`   ${String(n < 0 ? "?" : n).padStart(6)}  ${label}`);
  }
  const [sigs, photos] = await Promise.all([
    p.soldier.count({ where: { weaponsAgreementSignature: { not: null } } }),
    p.soldier.count({ where: { licensePhotoData: { not: null } } }),
  ]);
  console.log(`   ${String(sigs).padStart(6)}  חתימות אישיות (מוחרג מפורשות)`);
  console.log(`   ${String(photos).padStart(6)}  תמונות רישיון (מוחרג מפורשות)`);
  console.log(`\n   סה"כ ${exposed + sigs + photos} רשומות שאובדן שלהן לא ניתן לשחזור מהגיבוי הלוגי.`);

  console.log(`\n(קריאה בלבד — לא נכתב דבר)`);
}
main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => p.$disconnect());
