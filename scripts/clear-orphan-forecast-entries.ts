/**
 * ניקוי חריגי תחזית יתומים — ForecastEntry של חיילים שאין להם ForecastOrder כלל.
 * נוצרו לפני שמודל הצו הונהג. כרגע הם מתעלמים, אבל היו קופצים בחזרה
 * ברגע שנקבע לחייל צו שחופף לתאריכים שלהם.
 * ריצה יבשה כברירת מחדל; --apply למחיקה.
 */
import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const withOrder = new Set(
    (await p.forecastOrder.findMany({ select: { soldierId: true } })).map((o) => o.soldierId),
  );
  const entries = await p.forecastEntry.findMany({
    select: {
      id: true, soldierId: true, date: true,
      status: { select: { name: true } },
      soldier: { select: { fullName: true, personalNumber: true, company: { select: { name: true } } } },
    },
    orderBy: { date: "asc" },
  });
  const orphans = entries.filter((e) => !withOrder.has(e.soldierId));

  console.log(`חריגים: ${entries.length} · יתומים (ללא צו): ${orphans.length}\n`);
  if (orphans.length === 0) { console.log("— אין מה למחוק —"); return; }

  const by = new Map<string, { label: string; reason: string; from: string; to: string; n: number }>();
  for (const e of orphans) {
    const d = e.date.toISOString().slice(0, 10);
    const cur = by.get(e.soldierId);
    if (!cur) {
      by.set(e.soldierId, {
        label: `${e.soldier.fullName} (${e.soldier.personalNumber ?? "—"} · ${e.soldier.company?.name ?? "—"})`,
        reason: e.status.name, from: d, to: d, n: 1,
      });
    } else { cur.n++; cur.to = d; }
  }
  for (const v of by.values()) console.log(`  🗑️  ${v.label} — ${v.reason} · ${v.from}→${v.to} · ${v.n} ימים`);

  if (APPLY) {
    const r = await p.forecastEntry.deleteMany({ where: { id: { in: orphans.map((e) => e.id) } } });
    console.log(`\n✅ נמחקו ${r.count} רשומות`);
  } else {
    console.log(`\n(ריצה יבשה — הרץ עם --apply למחיקה)`);
  }
}
main().finally(() => p.$disconnect());
