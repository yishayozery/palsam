/**
 * 🏭 בדיקת רב-מחסנים — מדמה יום החתמה אמיתי: כמה מחסנים מנפיקים במקביל
 * לפלוגות (כמותי, contention על מונה מלאי משותף) ולחיילים (סריאלי, cross-warehouse).
 * scoped לגדוד 21. מסומן notes="LT-MW" ונוקה בסוף.
 *
 * מודד throughput/latency/שגיאות + **בדיקת שלמות נתונים**: אחרי פרץ מקבילי,
 * quantity סופי == quantity התחלתי − הצלחות (מוכיח אפס lost-updates / corruption).
 *
 *   npx tsx --env-file=.env scripts/loadtest-multiwarehouse.ts
 */
import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
const LEVELS = [10, 25, 50];
const OPS_PER_LEVEL = 500;
const START_QTY = 20000;

function pct(s: number[], q: number) { return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0; }

async function main() {
  const b = await p.battalion.findFirst({ where: { code: "21" }, select: { id: true, name: true } });
  if (!b) throw new Error("גדוד 21 לא נמצא");
  const bId = b.id;
  const warehouses = await p.holder.findMany({ where: { battalionId: bId, kind: "WAREHOUSE" }, select: { id: true } });
  const companies = await p.holder.findMany({ where: { battalionId: bId, kind: "COMPANY" }, select: { id: true } });
  const soldiers = await p.soldier.findMany({ where: { battalionId: bId, personalNumber: { gte: "8800001", lte: "8800500" } }, select: { id: true } });
  const okStatus = await p.itemStatus.findFirst({ where: { battalionId: bId, isDefault: true }, select: { id: true } });
  const eqWh = await p.holder.findFirst({ where: { battalionId: bId, warehouseType: "EQUIPMENT" }, select: { id: true } });
  const actor = await p.appUser.findFirst({ where: { battalionId: bId }, select: { id: true } });
  if (!okStatus || !eqWh || !actor || warehouses.length === 0 || companies.length === 0 || soldiers.length === 0) throw new Error("חסרים נתוני-דמו — הרץ loadtest-seed קודם");

  // סוג-פריט כמותי + מלאי משותף (יעד ה-contention)
  const cat = await p.category.findFirst({ where: { battalionId: bId, name: { contains: "(דמו)" } }, select: { id: true } });
  const qItem = await p.itemType.create({ data: { battalionId: bId, name: "מנת-קרב (דמו עומס)", trackingMethod: "QUANTITY", categoryId: cat!.id, signable: false } });
  const stock = await p.stockBalance.create({ data: { battalionId: bId, itemTypeId: qItem.id, holderId: eqWh.id, statusId: okStatus.id, quantity: START_QTY } });

  console.log(`🏭 רב-מחסנים — ${b.name} | ${warehouses.length} מחסנים, ${companies.length} פלוגות, ${soldiers.length} חיילים\n`);
  console.log("תרחיש            | רמה | הצלחות | שגיאות | throughput | p50    | p95    | שלמות");
  console.log("-----------------|-----|--------|--------|------------|--------|--------|-------");

  async function runLevel(label: string, level: number, op: (i: number) => Promise<void>, integrity?: () => Promise<string>) {
    const lat: number[] = []; let ok = 0, err = 0, next = 0;
    const t0 = Date.now();
    await Promise.all(Array.from({ length: level }, async () => {
      for (;;) { const i = next++; if (i >= OPS_PER_LEVEL) return; const s = Date.now(); try { await op(i); lat.push(Date.now() - s); ok++; } catch { err++; } }
    }));
    const el = (Date.now() - t0) / 1000; lat.sort((a, z) => a - z);
    const integ = integrity ? await integrity() : "—";
    console.log(`${label.padEnd(16)} | ${String(level).padStart(3)} | ${String(ok).padStart(6)} | ${String(err).padStart(6)} | ${(ok / el).toFixed(1).padStart(7)}/s | ${String(pct(lat, 0.5)).padStart(4)}ms | ${String(pct(lat, 0.95)).padStart(4)}ms | ${integ}`);
    return ok;
  }

  for (const level of LEVELS) {
    // א. סריאלי → חיילים, cross-warehouse (INSERT Transfer מכל מחסן בסבב)
    await runLevel("סריאלי→חייל", level, async (i) => {
      await p.transfer.create({ data: { battalionId: bId, type: "SIGNOUT", status: "COMPLETED", createdById: actor.id, fromHolderId: warehouses[i % warehouses.length].id, toSoldierId: soldiers[i % soldiers.length].id, notes: "LT-MW" } });
    });

    // ב. כמותי → פלוגות, contention על מונה משותף (decrement אטומי + INSERT), עם בדיקת שלמות
    await p.stockBalance.update({ where: { id: stock.id }, data: { quantity: START_QTY } });
    const okB = await runLevel("כמותי→פלוגה", level, async (i) => {
      await p.$transaction(async (tx) => {
        const r = await tx.stockBalance.updateMany({ where: { id: stock.id, quantity: { gt: 0 } }, data: { quantity: { decrement: 1 } } });
        if (r.count === 0) throw new Error("out of stock");
        await tx.transfer.create({ data: { battalionId: bId, type: "ISSUE", status: "COMPLETED", createdById: actor.id, fromHolderId: eqWh!.id, toHolderId: companies[i % companies.length].id, notes: "LT-MW" } });
      });
    }, async () => "↓");
    const cur = await p.stockBalance.findUnique({ where: { id: stock.id }, select: { quantity: true } });
    const expected = START_QTY - okB;
    console.log(`   └─ שלמות מלאי: התחלתי ${START_QTY} − הצלחות ${okB} = צפוי ${expected} | בפועל ${cur?.quantity} → ${cur?.quantity === expected ? "✅ תקין (אפס lost-updates)" : "❌ אי-התאמה!"}`);
  }

  // ניקוי
  const delT = await p.transfer.deleteMany({ where: { battalionId: bId, notes: "LT-MW" } });
  await p.stockBalance.delete({ where: { id: stock.id } }).catch(() => {});
  await p.itemType.delete({ where: { id: qItem.id } }).catch(() => {});
  console.log(`\n🧹 נוקו ${delT.count} העברות-בדיקה + פריט/מלאי הדמו. (500 החיילים + הציוד הקבוע נשארו.)`);
}
main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => p.$disconnect());
