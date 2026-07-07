import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();

// גדסם 4 בלבד (code 5554) — לעולם לא לגעת בכרמלי
const BATTALION_CODE = "5554";

const MAPLEG_PERMS: { screen: string; level: "VIEW" | "EDIT" }[] = [
  { screen: "dashboard", level: "VIEW" }, { screen: "soldiers", level: "EDIT" },
  { screen: "attendance", level: "EDIT" }, { screen: "employment", level: "VIEW" },
  { screen: "dispatch", level: "EDIT" }, { screen: "certifications", level: "VIEW" },
  { screen: "signatures", level: "EDIT" }, { screen: "transfers", level: "EDIT" },
  { screen: "counts", level: "EDIT" }, { screen: "donations", level: "EDIT" },
  { screen: "vacation", level: "EDIT" },
  { screen: "stock", level: "VIEW" }, { screen: "gaps", level: "VIEW" },
  { screen: "reports", level: "VIEW" }, { screen: "armory_allocations", level: "VIEW" },
  { screen: "maintenance", level: "VIEW" }, { screen: "ymach", level: "EDIT" },
  { screen: "trainings", level: "VIEW" },
];

async function main() {
  const bat = await p.battalion.findUnique({ where: { code: BATTALION_CODE }, select: { id: true, name: true } });
  if (!bat) throw new Error(`Battalion ${BATTALION_CODE} not found`);
  console.log(`Battalion: ${bat.name} (${bat.id})`);

  // ===== 1) מפלג → עריכה =====
  const role = await p.systemRole.findUnique({
    where: { battalionId_name: { battalionId: bat.id, name: "מפלג" } },
    select: { id: true },
  });
  if (!role) {
    console.log("⚠️  אין תפקיד 'מפלג' לגדוד — מדלג");
  } else {
    for (const perm of MAPLEG_PERMS) {
      await p.screenPermission.upsert({
        where: { roleId_screen: { roleId: role.id, screen: perm.screen } },
        update: { level: perm.level },
        create: { roleId: role.id, screen: perm.screen, level: perm.level },
      });
    }
    const after = await p.screenPermission.count({ where: { roleId: role.id } });
    console.log(`✅ מפלג עודכן — ${MAPLEG_PERMS.length} מסכים (סה"כ ${after} רשומות)`);
  }

  // ===== 2) כפילות "בית" בסטטוסי נוכחות =====
  const bayit = await p.attendanceStatus.findMany({
    where: { battalionId: bat.id, name: "בית" },
    orderBy: { createdAt: "asc" },
    select: { id: true, active: true, createdAt: true },
  });
  console.log(`\n"בית" statuses found: ${bayit.length}`);
  if (bayit.length > 1) {
    const keeper = bayit[0];
    const dups = bayit.slice(1);
    for (const dup of dups) {
      const [plans, records] = await Promise.all([
        p.attendancePlan.updateMany({ where: { statusId: dup.id }, data: { statusId: keeper.id } }),
        p.attendanceRecord.updateMany({ where: { statusId: dup.id }, data: { statusId: keeper.id } }),
      ]);
      await p.attendanceStatus.delete({ where: { id: dup.id } });
      console.log(`  מוזג כפיל ${dup.id} → ${keeper.id} (תוכניות: ${plans.count}, ביצוע: ${records.count})`);
    }
    console.log(`✅ נשאר סטטוס "בית" אחד: ${keeper.id}`);
  } else {
    console.log("אין כפילות — מדלג");
  }
}

main().then(() => p.$disconnect()).catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
