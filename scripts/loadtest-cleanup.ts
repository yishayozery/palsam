/**
 * 🧹 ניקוי נתוני-הדמו של גדוד 21 (אם תרצה להסיר אחרי הצגה). scoped לגדוד 21 בלבד,
 * לפי המסמנים של הזריעה: personalNumber 8800001-8800500, יחידות DEMO-*21-*, קטגוריית "(דמו)".
 * לא רץ אוטומטית — הרץ ידנית רק כשתחליט:
 *
 *   npx tsx --env-file=.env scripts/loadtest-cleanup.ts
 */
import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();

async function main() {
  const b = await p.battalion.findFirst({ where: { code: "21" }, select: { id: true } });
  if (!b) throw new Error("גדוד 21 לא נמצא");
  const bId = b.id;
  const cats = await p.category.findMany({ where: { battalionId: bId, name: { contains: "(דמו)" } }, select: { id: true } });
  const catIds = cats.map((c) => c.id);
  const items = catIds.length ? await p.itemType.findMany({ where: { categoryId: { in: catIds } }, select: { id: true } }) : [];
  const itemIds = items.map((i) => i.id);

  const u = itemIds.length ? await p.serialUnit.deleteMany({ where: { battalionId: bId, itemTypeId: { in: itemIds } } }) : { count: 0 };
  const s = await p.soldier.deleteMany({ where: { battalionId: bId, personalNumber: { gte: "8800001", lte: "8800500" } } });
  if (itemIds.length) await p.itemType.deleteMany({ where: { id: { in: itemIds } } });
  if (catIds.length) await p.category.deleteMany({ where: { id: { in: catIds } } });
  const comps = await p.holder.deleteMany({ where: { battalionId: bId, kind: "COMPANY", name: { in: ["פלוגה א'", "פלוגה ב'", "פלוגה ג'", "פלוגה ד'", "מפקדה"] } } });

  console.log(`🧹 נמחקו: ${s.count} חיילים, ${u.count} יחידות, ${comps.count} פלוגות, ${itemIds.length} סוגי-פריט, ${catIds.length} קטגוריות.`);
}
main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => p.$disconnect());
