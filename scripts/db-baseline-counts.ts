/**
 * 🧪 DB baseline drill — מאמת קישוריות ומדפיס ספירות של הטבלאות הקריטיות.
 * READ-ONLY. רץ עם ה-DB הנוכחי, ללא כלי pg חיצוניים.
 *
 * שימוש: (1) לפני הגירה — לתפוס baseline; (2) אחרי שחזור ביעד — להריץ שוב ולהשוות.
 *   npx tsx --env-file=.env scripts/db-baseline-counts.ts
 */
import { PrismaClient } from "../src/generated/prisma";

const p = new PrismaClient();

async function main() {
  const t0 = Date.now();
  // בדיקת קישוריות
  await p.$queryRaw`SELECT 1`;
  const pingMs = Date.now() - t0;

  const [battalions, users, soldiers, holders, itemTypes, serialUnits, signatures, transfers, countSessions, requests] = await Promise.all([
    p.battalion.count(), p.appUser.count(), p.soldier.count(), p.holder.count(),
    p.itemType.count(), p.serialUnit.count(), p.signature.count(), p.transfer.count(),
    p.countSession.count(), p.request.count(),
  ]);

  const rows: [string, number][] = [
    ["Battalion", battalions], ["AppUser", users], ["Soldier", soldiers], ["Holder", holders],
    ["ItemType", itemTypes], ["SerialUnit", serialUnits], ["Signature", signatures],
    ["Transfer", transfers], ["CountSession", countSessions], ["Request", requests],
  ];

  console.log(`✅ קישוריות תקינה (ping ${pingMs}ms)\n`);
  console.log("baseline ספירות טבלאות קריטיות:");
  for (const [name, n] of rows) console.log(`  ${name.padEnd(14)} ${n.toLocaleString()}`);
  console.log(`\n🎯 שמור פלט זה. אחרי שחזור ביעד — הרץ שוב וודא התאמה.`);
}

main().catch((e) => { console.error("❌ drill נכשל:", e); process.exit(1); }).finally(() => p.$disconnect());
