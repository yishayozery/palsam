/**
 * 🔥 פרץ-כתיבה — מדמה יום החתמה המונית: INSERT אמיתי של החתמות לגדוד 21 במקביל.
 * ramp קונקרנטיות, מדידת signings/sec + p50/p95/p99 + שגיאות. מסומן LT21- ונמחק בסוף
 * (ארטיפקט עומס, לא נתוני-דמו קבועים). scoped לגדוד 21 בלבד.
 *
 * ⚠️ DB פרודקשן משותף. round-robin על חיילים שונים → אין נעילת-שורה מלאכותית.
 * בטיחות: אם שגיאות > 20% ברמה — עוצר.
 *
 *   npx tsx --env-file=.env scripts/loadtest-signburst.ts
 */
import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
const LEVELS = [10, 25, 50];
const SIGN_PER_LEVEL = 500; // גדוד שלם חותם

function pct(s: number[], q: number) { return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0; }

async function main() {
  const b = await p.battalion.findFirst({ where: { code: "21" }, select: { id: true, name: true } });
  if (!b) throw new Error("גדוד 21 לא נמצא");
  const bId = b.id;
  const soldiers = await p.soldier.findMany({ where: { battalionId: bId, personalNumber: { gte: "8800001", lte: "8800500" } }, select: { id: true, personalNumber: true } });
  if (soldiers.length === 0) throw new Error("אין חיילי-דמו — הרץ loadtest-seed קודם");

  console.log(`🔥 פרץ החתמה — ${b.name}, ${soldiers.length} חיילים, ${SIGN_PER_LEVEL} החתמות/רמה\n`);
  console.log("מקבילים | הצלחות | שגיאות | throughput  | p50    | p95    | p99");
  console.log("--------|--------|--------|-------------|--------|--------|-------");

  for (const level of LEVELS) {
    const lat: number[] = [];
    let ok = 0, err = 0, next = 0;
    const t0 = Date.now();
    async function worker(wid: number) {
      for (;;) {
        const i = next++;
        if (i >= SIGN_PER_LEVEL) return;
        const soldier = soldiers[i % soldiers.length];
        const s = Date.now();
        try {
          await p.signature.create({
            data: {
              battalionId: bId, soldierId: soldier.id, method: "ONSITE", status: "SIGNED",
              token: `LT21-${level}-${wid}-${i}-${Math.floor(Math.random() * 1e9)}`,
              signedAt: new Date(), signerPersonalId: soldier.personalNumber,
            },
          });
          lat.push(Date.now() - s); ok++;
        } catch { err++; }
      }
    }
    await Promise.all(Array.from({ length: level }, (_, w) => worker(w)));
    const elapsed = (Date.now() - t0) / 1000;
    lat.sort((a, z) => a - z);
    console.log(`${String(level).padStart(6)}  | ${String(ok).padStart(6)} | ${String(err).padStart(6)} | ${(ok / elapsed).toFixed(1).padStart(8)}/s | ${String(pct(lat, 0.5)).padStart(4)}ms | ${String(pct(lat, 0.95)).padStart(4)}ms | ${String(pct(lat, 0.99)).padStart(4)}ms`);
    if (err / SIGN_PER_LEVEL > 0.2) { console.log("\n🛑 שגיאות > 20% — עוצר."); break; }
  }

  // ניקוי ארטיפקטי-הפרץ (לא נתוני-דמו קבועים)
  const del = await p.signature.deleteMany({ where: { battalionId: bId, token: { startsWith: "LT21-" } } });
  console.log(`\n🧹 נמחקו ${del.count} החתמות-פרץ (הדמו הקבוע — 500 חיילים + ציוד — נשאר).`);
}
main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => p.$disconnect());
