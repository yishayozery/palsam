/**
 * ✅ אימות שלמות של adjustQuantity תחת מקביליות אמיתית (קורא ל-helper האמיתי).
 * גורע 1 יחידה N פעמים במקביל מאותה שורת-מלאי, ובודק: quantity סופי == התחלתי − הצלחות.
 * drift כלשהו = lost-update. scoped לגדוד 21, מנקה בסוף.
 *
 *   npx tsx --env-file=.env scripts/verify-adjustquantity.ts
 */
import { PrismaClient } from "../src/generated/prisma";
import { adjustQuantity } from "../src/lib/inventory";
const p = new PrismaClient();
const CONCURRENCY = 25;
const OPS = 500;
const START_QTY = 5000;

async function main() {
  const b = await p.battalion.findFirst({ where: { code: "21" }, select: { id: true } });
  if (!b) throw new Error("גדוד 21 לא נמצא");
  const bId = b.id;
  const eqWh = await p.holder.findFirst({ where: { battalionId: bId, warehouseType: "EQUIPMENT" }, select: { id: true } });
  const okStatus = await p.itemStatus.findFirst({ where: { battalionId: bId, isDefault: true }, select: { id: true } });
  const cat = await p.category.findFirst({ where: { battalionId: bId, name: { contains: "(דמו)" } }, select: { id: true } });
  if (!eqWh || !okStatus || !cat) throw new Error("חסרים נתוני-דמו — הרץ loadtest-seed קודם");

  const item = await p.itemType.create({ data: { battalionId: bId, name: "אימות-מלאי (דמו)", trackingMethod: "QUANTITY", categoryId: cat.id, signable: false } });
  await p.stockBalance.create({ data: { battalionId: bId, itemTypeId: item.id, holderId: eqWh.id, statusId: okStatus.id, quantity: START_QTY } });

  console.log(`✅ אימות adjustQuantity — ${OPS} גריעות מקבילות (concurrency ${CONCURRENCY}), התחלתי ${START_QTY}\n`);

  let ok = 0, err = 0, next = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const i = next++; if (i >= OPS) return;
      try {
        await p.$transaction((tx) => adjustQuantity(tx, bId, item.id, eqWh.id, okStatus.id, -1), { timeout: 20000, maxWait: 20000 });
        ok++;
      } catch { err++; }
    }
  }));
  const el = ((Date.now() - t0) / 1000).toFixed(1);

  const cur = await p.stockBalance.findFirst({ where: { itemTypeId: item.id, holderId: eqWh.id, statusId: okStatus.id, equipmentLocationId: null }, select: { quantity: true } });
  const actual = cur?.quantity ?? 0;
  const expected = START_QTY - ok;
  console.log(`הצלחות: ${ok} | שגיאות: ${err} | זמן: ${el}s | throughput: ${(ok / Number(el)).toFixed(0)}/s`);
  console.log(`שלמות: התחלתי ${START_QTY} − הצלחות ${ok} = צפוי ${expected} | בפועל ${actual}`);
  console.log(actual === expected ? "🎯 ✅ שלמות מושלמת — אפס lost-updates." : `🛑 ❌ DRIFT של ${expected - actual} יחידות — lost-update!`);

  // ניקוי
  await p.stockBalance.deleteMany({ where: { itemTypeId: item.id } });
  await p.itemType.delete({ where: { id: item.id } }).catch(() => {});
}
main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => p.$disconnect());
