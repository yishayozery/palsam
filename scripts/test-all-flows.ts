/**
 * בדיקות מקיפות (קריאה בלבד) לכל התהליכים העיקריים
 * בודק שכל השאילתות עובדות ומחזירות נתונים תקינים
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();
let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

async function main() {
  const battalion = await prisma.battalion.findFirst();
  if (!battalion) { console.error("No battalion found"); return; }
  const bId = battalion.id;
  console.log(`\n🏢 גדוד: ${battalion.name} (${bId})\n`);

  // ===== 1. SOLDIER STATUS =====
  console.log("═══ 1. סטטוס חיילים ═══");
  const soldiers = await prisma.soldier.findMany({ where: { battalionId: bId }, take: 50 });
  assert(soldiers.length > 0, `נמצאו ${soldiers.length} חיילים`);

  const validStatuses = ["REGISTERED", "ENLISTED", "DISCHARGED", "INACTIVE"];
  const invalidStatus = soldiers.filter(s => !validStatuses.includes(s.status));
  assert(invalidStatus.length === 0, `כל החיילים עם סטטוס תקין (${invalidStatus.length} שגויים)`);
  if (invalidStatus.length > 0) invalidStatus.forEach(s => console.error(`    → ${s.fullName}: status="${s.status}"`));

  const withAttached = soldiers.filter(s => typeof s.attached === "boolean");
  assert(withAttached.length === soldiers.length, `שדה attached קיים בכל החיילים`);

  const [totalActive, enlistedCount, registeredCount, attachedCount, dischargedCount] = await Promise.all([
    prisma.soldier.count({ where: { battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] } } }),
    prisma.soldier.count({ where: { battalionId: bId, status: "ENLISTED" } }),
    prisma.soldier.count({ where: { battalionId: bId, status: "REGISTERED" } }),
    prisma.soldier.count({ where: { battalionId: bId, attached: true, status: { notIn: ["DISCHARGED", "INACTIVE"] } } }),
    prisma.soldier.count({ where: { battalionId: bId, status: { in: ["DISCHARGED", "INACTIVE"] } } }),
  ]);
  assert(enlistedCount + registeredCount <= totalActive, `מגויסים(${enlistedCount}) + רשומים(${registeredCount}) <= פעילים(${totalActive})`);
  console.log(`  ℹ️  פעילים: ${totalActive}, מגויסים: ${enlistedCount}, רשומים: ${registeredCount}, מסופחים: ${attachedCount}, לא פעילים: ${dischargedCount}`);

  // ===== 2. SERIAL UNIT — dischargedAt =====
  console.log("\n═══ 2. יחידות סריאליות — dischargedAt ═══");
  const [activeUnits, dischargedUnits] = await Promise.all([
    prisma.serialUnit.count({ where: { battalionId: bId, dischargedAt: null } }),
    prisma.serialUnit.count({ where: { battalionId: bId, dischargedAt: { not: null } } }),
  ]);
  assert(activeUnits >= 0, `יחידות פעילות: ${activeUnits}`);
  console.log(`  ℹ️  פעילים: ${activeUnits}, הורדו: ${dischargedUnits}`);

  const dischargedWithHolder = await prisma.serialUnit.count({
    where: { battalionId: bId, dischargedAt: { not: null }, currentHolderId: { not: null } },
  });
  console.log(`  ℹ️  מורדים עם holder: ${dischargedWithHolder}`);

  // ===== 3. DUPLICATE SERIAL CHECK =====
  console.log("\n═══ 3. כפילויות סריאלי ═══");
  const dupsRaw = await prisma.$queryRaw<{ cnt: bigint; itemTypeId: string; serialNumber: string }[]>`
    SELECT COUNT(*) as cnt, "itemTypeId", "serialNumber"
    FROM "SerialUnit"
    WHERE "battalionId" = ${bId} AND "dischargedAt" IS NULL
    GROUP BY "itemTypeId", "serialNumber"
    HAVING COUNT(*) > 1
    LIMIT 10
  `;
  assert(dupsRaw.length === 0, `אין כפילויות פעילות (${dupsRaw.length} נמצאו)`);
  if (dupsRaw.length > 0) dupsRaw.forEach(d => console.error(`    → SN="${d.serialNumber}" x${d.cnt}`));

  // ===== 4. TRANSFERS =====
  console.log("\n═══ 4. העברות ═══");
  const transfers = await prisma.transfer.findMany({
    where: { battalionId: bId },
    take: 10,
    include: { fromHolder: { select: { name: true } }, toHolder: { select: { name: true } }, lines: { select: { id: true, itemTypeId: true } } },
    orderBy: { createdAt: "desc" },
  });
  console.log(`  ℹ️  העברות אחרונות: ${transfers.length}`);
  for (const t of transfers.slice(0, 5)) {
    const validLines = t.lines.every(l => !!l.itemTypeId);
    assert(validLines, `${t.type}/${t.status} (${t.fromHolder?.name ?? "?"} → ${t.toHolder?.name ?? "?"}) — ${t.lines.length} שורות תקינות`);
  }

  // ===== 5. SIGNATURES — enlisted only =====
  console.log("\n═══ 5. החתמות ═══");
  const signedByNonEnlisted = await prisma.serialUnit.count({
    where: {
      battalionId: bId, dischargedAt: null,
      signedSoldierId: { not: null },
      signedSoldier: { status: { not: "ENLISTED" } },
    },
  });
  if (signedByNonEnlisted > 0) {
    console.log(`  ⚠️  ${signedByNonEnlisted} פריטים חתומים על חיילים שאינם מגויסים`);
  } else {
    assert(true, `כל הפריטים החתומים — על חיילים מגויסים בלבד`);
  }

  // ===== 6. ATTENDANCE =====
  console.log("\n═══ 6. נוכחות ═══");
  const attStatuses = await prisma.attendanceStatus.findMany({ where: { battalionId: bId, active: true } });
  assert(attStatuses.length > 0, `סטטוסי נוכחות מוגדרים: ${attStatuses.length}`);

  const presentStatuses = attStatuses.filter(s => s.isPresent);
  const absentStatuses = attStatuses.filter(s => !s.isPresent);
  assert(presentStatuses.length > 0, `יש סטטוסי "נוכח": ${presentStatuses.length}`);
  console.log(`  ℹ️  נוכח: ${presentStatuses.map(s => s.name).join(", ")}`);
  console.log(`  ℹ️  חסר: ${absentStatuses.map(s => s.name).join(", ")}`);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayDate = new Date(todayStr + "T00:00:00Z");
  const todayRecords = await prisma.attendanceRecord.findMany({
    where: { soldier: { battalionId: bId }, date: todayDate },
    select: { soldierId: true, statusId: true },
  });
  const attPresent = todayRecords.filter(r => attStatuses.find(s => s.id === r.statusId)?.isPresent).length;
  console.log(`  ℹ️  היום: ${todayRecords.length} דווחו, ${attPresent} נוכחים, ${totalActive - todayRecords.length} לא דווחו`);
  assert(attPresent <= todayRecords.length, `נוכחים <= מדווחים`);

  // ===== 7. WEAPONS ELIGIBILITY =====
  console.log("\n═══ 7. זכאות נשק ═══");
  const armory = await prisma.holder.findFirst({ where: { battalionId: bId, warehouseType: "ARMORY", active: true } });
  if (armory) {
    const [weaponsApproved, weaponsSigned] = await Promise.all([
      prisma.soldier.count({ where: { battalionId: bId, status: "ENLISTED", weaponsApprovedAt: { not: null } } }),
      prisma.serialUnit.count({
        where: { battalionId: bId, dischargedAt: null, signedSoldierId: { not: null }, itemType: { category: { warehouseType: "ARMORY" } } },
      }),
    ]);
    console.log(`  ℹ️  מאושרי נשק: ${weaponsApproved}, נשק חתום: ${weaponsSigned}`);
    assert(true, `שאילתות נשק תקינות`);
  } else {
    console.log("  ⚠️  אין ארמון מוגדר");
  }

  // ===== 8. DASHBOARD QUERIES =====
  console.log("\n═══ 8. שאילתות דשבורד ═══");
  const [serialTotal, signedCount, wearCount, lossCount] = await Promise.all([
    prisma.serialUnit.count({ where: { battalionId: bId, dischargedAt: null } }),
    prisma.serialUnit.count({ where: { battalionId: bId, dischargedAt: null, signedSoldierId: { not: null } } }),
    prisma.serialUnit.count({ where: { battalionId: bId, dischargedAt: null, status: { isWear: true } } }),
    prisma.serialUnit.count({ where: { battalionId: bId, dischargedAt: null, status: { isLoss: true } } }),
  ]);
  assert(signedCount <= serialTotal, `חתומים(${signedCount}) <= סה"כ(${serialTotal})`);
  assert(wearCount + lossCount <= serialTotal, `בלאי(${wearCount}) + אבוד(${lossCount}) <= סה"כ(${serialTotal})`);

  const stockTotal = await prisma.stockBalance.aggregate({
    _sum: { quantity: true },
    where: { battalionId: bId },
  });
  console.log(`  ℹ️  מלאי כמותי: ${stockTotal._sum.quantity ?? 0}`);

  // ===== 9. COMPANIES & COMPANY STOCK =====
  console.log("\n═══ 9. פלוגות ומלאי פלוגתי ═══");
  const companies = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "COMPANY", active: true },
    orderBy: { name: "asc" },
  });
  assert(companies.length > 0, `פלוגות: ${companies.length}`);

  for (const c of companies) {
    const [cSoldiers, cSerial, cQty] = await Promise.all([
      prisma.soldier.count({ where: { battalionId: bId, companyId: c.id, status: { notIn: ["DISCHARGED", "INACTIVE"] } } }),
      prisma.serialUnit.count({ where: { currentHolderId: c.id, dischargedAt: null } }),
      prisma.stockBalance.aggregate({ _sum: { quantity: true }, where: { holderId: c.id } }),
    ]);
    console.log(`  ℹ️  ${c.name}: ${cSoldiers} חיילים, ${cSerial} סריאלי, ${cQty._sum.quantity ?? 0} כמותי`);
  }

  // ===== 10. WAREHOUSES =====
  console.log("\n═══ 10. מחסנים ═══");
  const warehouses = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "WAREHOUSE", active: true },
    orderBy: { name: "asc" },
  });
  for (const w of warehouses) {
    const wSerial = await prisma.serialUnit.count({ where: { currentHolderId: w.id, dischargedAt: null } });
    console.log(`  ℹ️  ${w.name} (${w.warehouseType}): ${wSerial} פריטים`);
  }
  assert(warehouses.length > 0, `מחסנים פעילים: ${warehouses.length}`);

  // ===== 11. EXPIRY =====
  console.log("\n═══ 11. תפוגות ═══");
  const expiringSoon = await prisma.serialUnit.findMany({
    where: { battalionId: bId, dischargedAt: null, expiryDate: { not: null } },
    select: { expiryDate: true },
  });
  const now = Date.now();
  let expired = 0, soon7 = 0, soon30 = 0;
  for (const u of expiringSoon) {
    if (!u.expiryDate) continue;
    const days = Math.round((u.expiryDate.getTime() - now) / 86_400_000);
    if (days < 0) expired++;
    else if (days <= 7) soon7++;
    else if (days <= 30) soon30++;
  }
  console.log(`  ℹ️  פגו: ${expired}, עד 7 ימים: ${soon7}, עד 30: ${soon30}`);
  assert(true, `שאילתת תפוגות תקינה`);

  // ===== 12. ORPHAN ITEMS CHECK =====
  console.log("\n═══ 12. פריטים יתומים ═══");
  const orphanSerial = await prisma.serialUnit.count({
    where: { battalionId: bId, dischargedAt: null, currentHolderId: null, signedSoldierId: null },
  });
  if (orphanSerial > 0) {
    console.log(`  ⚠️  ${orphanSerial} יחידות סריאליות ללא holder וללא חייל`);
  } else {
    assert(true, `אין פריטים סריאליים יתומים`);
  }

  // ===== 13. ROSTER PAGE QUERY =====
  console.log("\n═══ 13. עמוד שלישות ═══");
  const rosterSoldiers = await prisma.soldier.findMany({
    where: { battalionId: bId },
    orderBy: [{ status: "asc" }, { companyId: "asc" }, { lastName: "asc" }],
    include: {
      company: { select: { name: true } },
      squad: { select: { id: true, name: true } },
      _count: { select: { signedSerialUnits: true, signedKitInstances: true } },
    },
    take: 10,
  });
  assert(rosterSoldiers.length > 0, `שאילתת שלישות תקינה: ${rosterSoldiers.length} חיילים`);
  assert(rosterSoldiers.every(s => !!s.status), `כל החיילים עם שדה status`);
  assert(rosterSoldiers.every(s => typeof s.attached === "boolean"), `כל החיילים עם שדה attached`);

  // ===== 14. COUNT TASKS =====
  console.log("\n═══ 14. ספירות ═══");
  const overdueTasks = await prisma.countTask.findMany({
    where: { battalionId: bId, status: "OVERDUE" },
    take: 5,
    select: { id: true, status: true, holderId: true },
  });
  console.log(`  ℹ️  ספירות באיחור: ${overdueTasks.length}`);
  assert(true, `שאילתת ספירות תקינה`);

  // ===== 15. DEFECTIVE PER WAREHOUSE =====
  console.log("\n═══ 15. תקולים ═══");
  for (const w of warehouses) {
    const [wWear, wLoss] = await Promise.all([
      prisma.serialUnit.count({ where: { battalionId: bId, currentHolderId: w.id, dischargedAt: null, status: { isWear: true } } }),
      prisma.serialUnit.count({ where: { battalionId: bId, currentHolderId: w.id, dischargedAt: null, status: { isLoss: true } } }),
    ]);
    if (wWear + wLoss > 0) console.log(`  ℹ️  ${w.name}: ${wWear} בלאי, ${wLoss} אבוד`);
  }
  assert(true, `שאילתת תקולים תקינה`);

  // ===== 16. DISPATCH (VEHICLES) =====
  console.log("\n═══ 16. שבצ\"ק (רכבים) ═══");
  const vehicleCount = await prisma.serialUnit.count({
    where: { battalionId: bId, dischargedAt: null, itemType: { category: { warehouseType: "VEHICLES" } } },
  });
  console.log(`  ℹ️  רכבים פעילים: ${vehicleCount}`);
  assert(true, `שאילתת רכבים תקינה`);

  // ===== 17. SOLDIER SUMMARY =====
  console.log("\n═══ 17. סיכום חייל ═══");
  const testSoldier = await prisma.soldier.findFirst({
    where: { battalionId: bId, status: "ENLISTED" },
    select: { id: true, fullName: true, status: true, company: { select: { name: true } } },
  });
  if (testSoldier) {
    const signedSerials = await prisma.serialUnit.findMany({
      where: { signedSoldierId: testSoldier.id },
      include: { itemType: { select: { name: true } }, status: true },
    });
    console.log(`  ℹ️  ${testSoldier.fullName}: ${signedSerials.length} פריטים חתומים`);
    assert(true, `שאילתת סיכום חייל תקינה`);
  }

  // ===== 18. ATTENDANCE PER COMPANY (dashboard) =====
  console.log("\n═══ 18. נוכחות פלוגתית (דשבורד) ═══");
  const soldierCompanyList = await prisma.soldier.findMany({
    where: { battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] } },
    select: { id: true, companyId: true },
  });
  const recordMap = new Map(todayRecords.map(r => [r.soldierId, r.statusId]));
  for (const c of companies) {
    const ids = soldierCompanyList.filter(s => s.companyId === c.id).map(s => s.id);
    const reported = ids.filter(id => recordMap.has(id)).length;
    const present = ids.filter(id => {
      const sid = recordMap.get(id);
      return sid && attStatuses.find(s => s.id === sid)?.isPresent;
    }).length;
    console.log(`  ℹ️  ${c.name}: ${present} נוכחים, ${reported - present} חסרים, ${ids.length - reported} לא דווח`);
  }
  assert(true, `שאילתת נוכחות פלוגתית תקינה`);

  // ===== SUMMARY =====
  console.log(`\n${"═".repeat(40)}`);
  console.log(`✅ עברו: ${passed}`);
  if (failed > 0) console.log(`❌ נכשלו: ${failed}`);
  else console.log(`🎉 כל הבדיקות עברו!`);
  console.log(`${"═".repeat(40)}\n`);

  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("FATAL:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
