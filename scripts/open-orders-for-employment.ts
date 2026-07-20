/**
 * פתיחת צו לכל חיילי הגדוד לתעסוקה נתונה (ForecastOrder).
 * הצו נקבע על מלוא תאריכי התעסוקה; חריגים מסמנים אחר כך פר-חייל.
 * ריצה יבשה כברירת מחדל; --apply לכתיבה.
 *
 *   npx tsx scripts/open-orders-for-employment.ts --code 5222 --emp <id> [--apply]
 */
import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();

const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const APPLY = process.argv.includes("--apply");
const CODE = arg("--code") ?? "5222";
const EMP_ID = arg("--emp");
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  const b = await p.battalion.findUnique({ where: { code: CODE }, select: { id: true, name: true } });
  if (!b) { console.log(`❌ אין גדוד עם קוד ${CODE}`); return; }

  const emp = EMP_ID
    ? await p.employment.findFirst({ where: { id: EMP_ID, battalionId: b.id }, select: { id: true, name: true, startDate: true, endDate: true } })
    : null;
  if (!emp) { console.log(`❌ תעסוקה לא נמצאה. העבר --emp <id>`); return; }

  console.log(`${b.name} · תעסוקה "${emp.name}" · ${iso(emp.startDate)} → ${iso(emp.endDate)}\n`);

  const soldiers = await p.soldier.findMany({
    where: { battalionId: b.id, status: { notIn: ["DISCHARGED", "INACTIVE"] } },
    select: { id: true, fullName: true, company: { select: { name: true } } },
  });
  const existing = new Set(
    (await p.forecastOrder.findMany({ where: { employmentId: emp.id }, select: { soldierId: true } })).map((o) => o.soldierId),
  );
  const toCreate = soldiers.filter((s) => !existing.has(s.id));

  const byCompany = new Map<string, number>();
  for (const s of toCreate) {
    const c = s.company?.name ?? "ללא פלוגה";
    byCompany.set(c, (byCompany.get(c) ?? 0) + 1);
  }
  console.log(`חיילים פעילים: ${soldiers.length} · כבר עם צו: ${existing.size} · ייווצרו: ${toCreate.length}`);
  for (const [c, n] of [...byCompany.entries()].sort((a, b2) => b2[1] - a[1])) console.log(`   ${c.padEnd(14)} ${n}`);

  if (!APPLY) { console.log(`\n(ריצה יבשה — הרץ עם --apply)`); return; }

  let done = 0;
  for (const s of toCreate) {
    await p.forecastOrder.upsert({
      where: { soldierId_employmentId: { soldierId: s.id, employmentId: emp.id } },
      update: { startDate: emp.startDate, endDate: emp.endDate },
      create: { soldierId: s.id, employmentId: emp.id, startDate: emp.startDate, endDate: emp.endDate, note: "פתיחה קבוצתית" },
    });
    done++;
  }
  console.log(`\n✅ נוצרו ${done} צווים`);
}
main().finally(() => p.$disconnect());
