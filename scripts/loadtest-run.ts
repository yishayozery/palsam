/**
 * 🧪 בדיקת עומס — מדמה "טעינות עמוד" מקבילות (צרורות שאילתות של המסכים הכבדים)
 * scoped לגדוד 21. ramp קונקרנטיות [10,25,50,100]. מודד p50/p95/p99, throughput, שגיאות.
 *
 * ⚠️ רץ מול DB פרודקשן משותף. ה-latency המוחלט כולל את רשת המחשב המקומי (~קבוע) —
 *    האות האמיתי הוא ה-DELTA בין הרמות (האם ה-DB מחזיק 100 מקבילים בלי להתפוצץ).
 * בטיחות: אם שיעור השגיאות ברמה עולה על 20% — עוצר את שאר הרמות.
 *
 *   npx tsx --env-file=.env scripts/loadtest-run.ts
 */
import { PrismaClient } from "../src/generated/prisma";

const p = new PrismaClient();
const LEVELS = [10, 25, 50, 100];
const REQ_PER_LEVEL = 300;

function pct(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

async function main() {
  const b = await p.battalion.findFirst({ where: { code: "21" }, select: { id: true, name: true } });
  if (!b) throw new Error("גדוד 21 לא נמצא");
  const bId = b.id;

  // צרורות שאילתות המדמים את המסכים הכבדים ביותר (scoped לגדוד 21)
  const bundles: (() => Promise<unknown>)[] = [
    // מסך חיילים — טבלה עשירה + מונים
    () => Promise.all([
      p.soldier.findMany({ where: { battalionId: bId }, select: { id: true, fullName: true, personalNumber: true, dietType: true, company: { select: { name: true } } }, take: 500 }),
      p.soldier.count({ where: { battalionId: bId } }),
    ]),
    // ציוד חתום / דוח מחסן — יחידות סריאליות + relations
    () => p.serialUnit.findMany({ where: { battalionId: bId, signedSoldierId: { not: null } }, select: { id: true, serialNumber: true, itemType: { select: { name: true } }, signedSoldier: { select: { fullName: true } } }, take: 400 }),
    // דשבורד — מונים מרובים
    () => Promise.all([
      p.soldier.count({ where: { battalionId: bId } }),
      p.serialUnit.count({ where: { battalionId: bId } }),
      p.holder.count({ where: { battalionId: bId, kind: "COMPANY" } }),
      p.itemType.count({ where: { battalionId: bId } }),
    ]),
    // מדד מזון — groupBy
    () => p.soldier.groupBy({ by: ["companyId", "dietType"], where: { battalionId: bId, dietType: { not: null } }, _count: { _all: true } }),
  ];

  console.log(`🎯 בדיקת עומס על ${b.name} — ${bundles.length} סוגי-שאילתות, ${REQ_PER_LEVEL} בקשות/רמה\n`);
  console.log("רמה   | הצלחות | שגיאות | throughput | p50     | p95     | p99");
  console.log("------|--------|--------|------------|---------|---------|--------");

  let baselineP50 = 0;
  for (const level of LEVELS) {
    const lat: number[] = [];
    let ok = 0, err = 0, next = 0;
    const t0 = Date.now();
    async function worker() {
      for (;;) {
        const i = next++;
        if (i >= REQ_PER_LEVEL) return;
        const bundle = bundles[i % bundles.length];
        const s = Date.now();
        try { await bundle(); lat.push(Date.now() - s); ok++; }
        catch { err++; }
      }
    }
    await Promise.all(Array.from({ length: level }, () => worker()));
    const elapsed = (Date.now() - t0) / 1000;
    lat.sort((a, z) => a - z);
    const p50 = pct(lat, 0.5), p95 = pct(lat, 0.95), p99 = pct(lat, 0.99);
    if (!baselineP50) baselineP50 = p50;
    const tput = (ok / elapsed).toFixed(1);
    console.log(`${String(level).padStart(4)}  | ${String(ok).padStart(6)} | ${String(err).padStart(6)} | ${tput.padStart(7)}/s | ${String(p50).padStart(5)}ms | ${String(p95).padStart(5)}ms | ${String(p99).padStart(4)}ms`);
    if (err / REQ_PER_LEVEL > 0.2) { console.log("\n🛑 שיעור שגיאות > 20% — עוצר את שאר הרמות (הגנה)."); break; }
  }

  // דגימת מסלול-כתיבה (transaction שנכשל תמיד → rollback, לא משאיר שום דבר)
  console.log("\n✍️  דגימת latency לכתיבה (20 עסקאות, rollback מלא — לא נשמר דבר):");
  const wlat: number[] = [];
  await Promise.all(Array.from({ length: 10 }, async () => {
    for (let i = 0; i < 2; i++) {
      const s = Date.now();
      try {
        await p.$transaction(async (tx) => {
          await tx.soldier.count({ where: { battalionId: bId } });
          throw new Error("rollback");
        });
      } catch { /* rollback מכוון */ }
      wlat.push(Date.now() - s);
    }
  }));
  wlat.sort((a, z) => a - z);
  console.log(`  write p50=${pct(wlat, 0.5)}ms  p95=${pct(wlat, 0.95)}ms`);

  console.log(`\n📊 baseline p50 (רמה 10) = ${baselineP50}ms. הדלתא לרמה 100 מראה כמה ה-DB "מרגיש" את הפרץ.`);
}

main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => p.$disconnect());
