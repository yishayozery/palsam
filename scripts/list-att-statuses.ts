import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
async function main() {
  const bat = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true } });
  const st = await p.attendanceStatus.findMany({
    where: { battalionId: bat!.id },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, active: true, isPresent: true, sortOrder: true, _count: { select: { plans: true, records: true } } },
  });
  for (const s of st) console.log(`[${s.active ? "✓" : "✗"}] "${s.name}" | present=${s.isPresent} | sort=${s.sortOrder} | plans=${s._count.plans} records=${s._count.records} | ${s.id}`);
}
main().then(() => p.$disconnect());
