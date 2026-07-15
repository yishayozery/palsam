/**
 * 🧹 מרוקן נתוני-דמו/שחזור מגדוד (שומר מחסנים+סטטוסים; מסיר חיילים/ציוד/פלוגות/פריטים).
 * מדדד גם מחסנים כפולים (מאותו שם) שנוצרו בשחזור. scoped לגדוד הנתון.
 *
 *   npx tsx --env-file=.env scripts/cleanup-battalion-data.ts <CODE>
 */
import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();

async function main() {
  const code = process.argv[2];
  if (!code) throw new Error("שימוש: cleanup-battalion-data <CODE>");
  const b = await p.battalion.findFirst({ where: { code }, select: { id: true, name: true } });
  if (!b) throw new Error("גדוד לא נמצא");
  const bId = b.id;

  const soldierIds = (await p.soldier.findMany({ where: { battalionId: bId }, select: { id: true } })).map((s) => s.id);
  const transferIds = (await p.transfer.findMany({ where: { battalionId: bId }, select: { id: true } })).map((t) => t.id);

  const sig = await p.signature.deleteMany({ where: { battalionId: bId } });
  const tl = transferIds.length ? await p.transferLine.deleteMany({ where: { transferId: { in: transferIds } } }) : { count: 0 };
  const tr = await p.transfer.deleteMany({ where: { battalionId: bId } });
  const su = await p.serialUnit.deleteMany({ where: { battalionId: bId } });
  const sb = await p.stockBalance.deleteMany({ where: { battalionId: bId } });
  const sol = soldierIds.length ? await p.soldier.deleteMany({ where: { id: { in: soldierIds } } }) : { count: 0 };
  const it = await p.itemType.deleteMany({ where: { battalionId: bId } });
  const cat = await p.category.deleteMany({ where: { battalionId: bId } });
  const comp = await p.holder.deleteMany({ where: { battalionId: bId, kind: "COMPANY" } });

  // דדדוּפ מחסנים כפולים (שם זהה) — שומרים את הישן ביותר לכל שם
  const whs = await p.holder.findMany({ where: { battalionId: bId, kind: "WAREHOUSE" }, select: { id: true, name: true, createdAt: true }, orderBy: { createdAt: "asc" } });
  const seen = new Set<string>(); const dupIds: string[] = [];
  for (const w of whs) { if (seen.has(w.name)) dupIds.push(w.id); else seen.add(w.name); }
  const dedup = dupIds.length ? await p.holder.deleteMany({ where: { id: { in: dupIds } } }) : { count: 0 };

  console.log(`🧹 ${b.name} (${code}) נוקה:`);
  console.log(`  חתימות ${sig.count} | שורות-שינוע ${tl.count} | שינועים ${tr.count} | יחידות ${su.count} | מלאי ${sb.count}`);
  console.log(`  חיילים ${sol.count} | סוגי-פריט ${it.count} | קטגוריות ${cat.count} | פלוגות ${comp.count} | מחסנים-כפולים ${dedup.count}`);
  const left = await p.holder.count({ where: { battalionId: bId, kind: "WAREHOUSE" } });
  console.log(`  נותרו ${left} מחסנים (מקוריים).`);
}
main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => p.$disconnect());
