import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();
const TEST_SN = "__TEST_DISCHARGE_001__";
let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.log(`  ❌ ${msg}`); }
}

async function cleanup(bId: string, itemTypeId: string) {
  await prisma.transferLine.deleteMany({
    where: { transfer: { battalionId: bId, reason: { startsWith: "__TEST__" } } },
  });
  await prisma.transfer.deleteMany({ where: { battalionId: bId, reason: { startsWith: "__TEST__" } } });
  await prisma.serialUnit.deleteMany({ where: { battalionId: bId, serialNumber: TEST_SN, itemTypeId } });
}

async function main() {
  // Setup: find a battalion, warehouse holder, item type
  const battalion = await prisma.battalion.findFirst();
  if (!battalion) throw new Error("No battalion found");
  const bId = battalion.id;

  const warehouse = await prisma.holder.findFirst({ where: { battalionId: bId, kind: "WAREHOUSE", active: true } });
  if (!warehouse) throw new Error("No warehouse found");

  const itemType = await prisma.itemType.findFirst({ where: { battalionId: bId, trackingMethod: "SERIAL" } });
  if (!itemType) throw new Error("No serial item type found");

  const status = await prisma.itemStatus.findFirst({ where: { battalionId: bId, active: true, isDefault: true } });
  if (!status) throw new Error("No default status found");

  const user = await prisma.appUser.findFirst({ where: { battalionId: bId } });
  if (!user) throw new Error("No user found");

  console.log(`\n🔧 Setup: גדוד=${battalion.name}, מחסן=${warehouse.name}, פריט=${itemType.name}\n`);

  // Cleanup any previous test data
  await cleanup(bId, itemType.id);

  // ─── TEST 1: קליטה (INTAKE) ───
  console.log("📥 TEST 1: קליטה למלאי");
  const su = await prisma.serialUnit.create({
    data: { battalionId: bId, itemTypeId: itemType.id, serialNumber: TEST_SN, statusId: status.id, currentHolderId: warehouse.id },
  });
  await prisma.transfer.create({
    data: {
      battalionId: bId, type: "INTAKE", status: "COMPLETED",
      toHolderId: warehouse.id, reason: "__TEST__ intake",
      createdById: user.id, approvedById: user.id, approvedAt: new Date(),
      lines: { create: { itemTypeId: itemType.id, quantity: 1, serialUnitId: su.id, statusId: status.id } },
    },
  });

  const afterIntake = await prisma.serialUnit.findUnique({ where: { id: su.id } });
  assert(afterIntake !== null, "פריט נוצר בDB");
  assert(afterIntake!.currentHolderId === warehouse.id, "פריט שייך למחסן");
  assert(afterIntake!.dischargedAt === null, "dischargedAt = null (פעיל)");

  // Check stock query (active items only)
  const activeStock = await prisma.serialUnit.findMany({
    where: { battalionId: bId, itemTypeId: itemType.id, serialNumber: TEST_SN, dischargedAt: null },
  });
  assert(activeStock.length === 1, "מופיע בשאילתת מלאי פעיל");

  // ─── TEST 2: זיכוי (WRITE_OFF) — withdrawMulti style ───
  console.log("\n📤 TEST 2: זיכוי מהמלאי (WRITE_OFF)");
  const now = new Date();
  await prisma.serialUnit.update({
    where: { id: su.id },
    data: { currentHolderId: null, signedSoldierId: null, dischargedAt: now },
  });
  await prisma.transfer.create({
    data: {
      battalionId: bId, type: "WRITE_OFF", status: "COMPLETED",
      fromHolderId: warehouse.id, reason: "__TEST__ write-off",
      createdById: user.id, approvedById: user.id, approvedAt: now,
      lines: { create: { itemTypeId: itemType.id, quantity: 1, serialUnitId: su.id, statusId: status.id } },
    },
  });

  const afterWriteOff = await prisma.serialUnit.findUnique({ where: { id: su.id } });
  assert(afterWriteOff !== null, "פריט עדיין קיים בDB (לא נמחק)");
  assert(afterWriteOff!.currentHolderId === null, "currentHolderId = null");
  assert(afterWriteOff!.dischargedAt !== null, "dischargedAt מוגדר");

  // Stock queries should NOT include discharged items
  const activeAfterWO = await prisma.serialUnit.findMany({
    where: { battalionId: bId, itemTypeId: itemType.id, serialNumber: TEST_SN, dischargedAt: null },
  });
  assert(activeAfterWO.length === 0, "לא מופיע בשאילתת מלאי פעיל");

  // But total (including discharged) should still find it
  const allIncludingDischarged = await prisma.serialUnit.findMany({
    where: { battalionId: bId, itemTypeId: itemType.id, serialNumber: TEST_SN },
  });
  assert(allIncludingDischarged.length === 1, "עדיין קיים בDB (כולל מזוכים)");

  // ─── TEST 3: בדיקת כפילות — סריאלי פעיל ═══
  console.log("\n🔍 TEST 3: בדיקת כפילות");
  const duplicateCheckActive = await prisma.serialUnit.findMany({
    where: { battalionId: bId, itemTypeId: itemType.id, serialNumber: { in: [TEST_SN] }, dischargedAt: null },
    select: { serialNumber: true },
  });
  assert(duplicateCheckActive.length === 0, "בדיקת כפילות פעילים — אין כפילות (הפריט מזוכה)");

  // ─── TEST 4: קליטה מחדש של אותו סריאלי ───
  console.log("\n📥 TEST 4: קליטה מחדש — אותו מספר סריאלי");
  // Delete old discharged record (like INTAKE code does)
  const discharged = await prisma.serialUnit.findFirst({
    where: { battalionId: bId, itemTypeId: itemType.id, serialNumber: TEST_SN, dischargedAt: { not: null } },
  });
  assert(discharged !== null, "מצא פריט מזוכה ישן");
  if (discharged) {
    await prisma.serialUnit.delete({ where: { id: discharged.id } });
  }

  const su2 = await prisma.serialUnit.create({
    data: { battalionId: bId, itemTypeId: itemType.id, serialNumber: TEST_SN, statusId: status.id, currentHolderId: warehouse.id },
  });
  await prisma.transfer.create({
    data: {
      battalionId: bId, type: "INTAKE", status: "COMPLETED",
      toHolderId: warehouse.id, reason: "__TEST__ re-intake",
      createdById: user.id, approvedById: user.id, approvedAt: new Date(),
      lines: { create: { itemTypeId: itemType.id, quantity: 1, serialUnitId: su2.id, statusId: status.id } },
    },
  });

  const afterReIntake = await prisma.serialUnit.findUnique({ where: { id: su2.id } });
  assert(afterReIntake !== null, "פריט חדש נוצר בהצלחה");
  assert(afterReIntake!.serialNumber === TEST_SN, "אותו מספר סריאלי");
  assert(afterReIntake!.dischargedAt === null, "dischargedAt = null (פעיל)");
  assert(afterReIntake!.currentHolderId === warehouse.id, "שייך למחסן");
  assert(su2.id !== su.id, "ID חדש (שורה חדשה, לא אותו רשומה)");

  const activeAfterReIntake = await prisma.serialUnit.findMany({
    where: { battalionId: bId, itemTypeId: itemType.id, serialNumber: TEST_SN, dischargedAt: null },
  });
  assert(activeAfterReIntake.length === 1, "פריט אחד פעיל במלאי");

  // ─── TEST 5: ניפוק (ISSUE) + אישור — לא משנה dischargedAt ───
  console.log("\n🔄 TEST 5: ניפוק לפלוגה (ISSUE PENDING → COMPLETED)");
  const company = await prisma.holder.findFirst({ where: { battalionId: bId, kind: "COMPANY", active: true } });
  if (company) {
    const issueTransfer = await prisma.transfer.create({
      data: {
        battalionId: bId, type: "ISSUE", status: "PENDING",
        fromHolderId: warehouse.id, toHolderId: company.id,
        reason: "__TEST__ issue",
        createdById: user.id,
        lines: { create: { itemTypeId: itemType.id, quantity: 1, serialUnitId: su2.id, statusId: status.id } },
      },
    });

    const duringPending = await prisma.serialUnit.findUnique({ where: { id: su2.id } });
    assert(duringPending!.currentHolderId === warehouse.id, "בזמן PENDING — פריט עדיין במחסן");
    assert(duringPending!.dischargedAt === null, "בזמן PENDING — עדיין פעיל");

    // Approve: move to company
    await prisma.serialUnit.update({ where: { id: su2.id }, data: { currentHolderId: company.id } });
    await prisma.transfer.update({ where: { id: issueTransfer.id }, data: { status: "COMPLETED", approvedById: user.id, approvedAt: new Date() } });

    const afterApprove = await prisma.serialUnit.findUnique({ where: { id: su2.id } });
    assert(afterApprove!.currentHolderId === company.id, "אחרי אישור — פריט בפלוגה");
    assert(afterApprove!.dischargedAt === null, "אחרי אישור — עדיין פעיל (לא מזוכה)");

    // Return to warehouse
    await prisma.serialUnit.update({ where: { id: su2.id }, data: { currentHolderId: warehouse.id } });
  } else {
    console.log("  ⚠️  אין פלוגה — דילוג על בדיקת ניפוק");
  }

  // ─── TEST 6: withdrawSerials style (was delete, now soft-discharge) ───
  console.log("\n📤 TEST 6: זיכוי סריאלי (withdrawSerials style)");
  await prisma.serialUnit.update({
    where: { id: su2.id },
    data: { currentHolderId: null, signedSoldierId: null, dischargedAt: new Date() },
  });
  const afterWithdraw = await prisma.serialUnit.findUnique({ where: { id: su2.id } });
  assert(afterWithdraw!.dischargedAt !== null, "dischargedAt מוגדר");
  assert(afterWithdraw!.currentHolderId === null, "currentHolderId = null");

  const finalActive = await prisma.serialUnit.findMany({
    where: { battalionId: bId, itemTypeId: itemType.id, serialNumber: TEST_SN, dischargedAt: null },
  });
  assert(finalActive.length === 0, "אין פריטים פעילים עם הסריאלי הזה");

  // ─── TEST 7: verify existing 7 orphans are discharged ───
  console.log("\n🔍 TEST 7: בדיקת 7 הפריטים היתומים");
  const orphans = await prisma.serialUnit.findMany({
    where: { battalionId: bId, currentHolderId: null, dischargedAt: null },
  });
  assert(orphans.length === 0, `אין פריטים יתומים (currentHolderId=null, dischargedAt=null). נמצאו: ${orphans.length}`);

  // ─── Cleanup ───
  console.log("\n🧹 ניקוי...");
  await cleanup(bId, itemType.id);

  console.log(`\n${"═".repeat(40)}`);
  console.log(`  סה"כ: ${passed + failed} בדיקות — ✅ ${passed} עברו, ❌ ${failed} נכשלו`);
  console.log(`${"═".repeat(40)}\n`);

  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error("💥 שגיאה:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
