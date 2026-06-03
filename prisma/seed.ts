/**
 * Seed — בונה מופע גדוד דמו מלא:
 * מילונים (קטגוריות/סטטוסים/תדירויות), מבנה ארגוני (מחסן/פלוגות/נשקייה),
 * משתמשים לכל תפקיד, חיילים, מק"טים מכל 4 שיטות הניהול, הגדרת ערכה, ומלאי התחלתי.
 */
import { PrismaClient } from "../src/generated/prisma";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 מתחיל seed...");

  // ניקוי (סדר הפוך לתלויות)
  await prisma.auditLog.deleteMany();
  await prisma.discrepancy.deleteMany();
  await prisma.countLine.deleteMany();
  await prisma.countSession.deleteMany();
  await prisma.countDefinition.deleteMany();
  await prisma.signature.deleteMany();
  await prisma.transferLine.deleteMany();
  await prisma.transfer.deleteMany();
  await prisma.kitQtyLine.deleteMany();
  await prisma.serialUnit.deleteMany();
  await prisma.kitInstance.deleteMany();
  await prisma.stockBalance.deleteMany();
  await prisma.kitComponent.deleteMany();
  await prisma.itemType.deleteMany();
  await prisma.countFrequency.deleteMany();
  await prisma.itemStatus.deleteMany();
  await prisma.category.deleteMany();
  await prisma.soldier.deleteMany();
  await prisma.appUser.deleteMany();
  await prisma.holder.deleteMany();

  // ===== מבנה ארגוני =====
  const warehouse = await prisma.holder.create({
    data: { type: "WAREHOUSE", name: "מחסן גדודי", code: "WH" },
  });
  const companyA = await prisma.holder.create({
    data: { type: "COMPANY", name: 'פלוגה א\'', code: "A", parentId: warehouse.id },
  });
  const companyB = await prisma.holder.create({
    data: { type: "COMPANY", name: 'פלוגה ב\'', code: "B", parentId: warehouse.id },
  });
  const armory = await prisma.holder.create({
    data: { type: "ARMORY", name: "נשקייה", code: "ARM", parentId: warehouse.id },
  });

  // ===== משתמשים =====
  const pw = await bcrypt.hash("123456", 10);
  await prisma.appUser.createMany({
    data: [
      { username: "admin", passwordHash: pw, fullName: "מנהל מערכת", role: "ADMIN" },
      { username: "klag", passwordHash: pw, fullName: 'קל"ג גדודי', role: "LOGISTICS", holderId: warehouse.id },
      { username: "raspa", passwordHash: pw, fullName: 'רס"פ פלוגה א\'', role: "COMPANY_SP", holderId: companyA.id },
      { username: "raspb", passwordHash: pw, fullName: 'רס"פ פלוגה ב\'', role: "COMPANY_SP", holderId: companyB.id },
      { username: "armory", passwordHash: pw, fullName: "אחראי נשקייה", role: "ARMORY", holderId: armory.id },
      { username: "magad", passwordHash: pw, fullName: 'מג"ד (צופה)', role: "VIEWER" },
    ],
  });

  // ===== מילונים: קטגוריות =====
  const catNames = ['אמל"ח', "חבלה", "תקשוב", "לוגיסטיקה"];
  const cats: Record<string, string> = {};
  for (let i = 0; i < catNames.length; i++) {
    const c = await prisma.category.create({ data: { name: catNames[i], sortOrder: i } });
    cats[catNames[i]] = c.id;
  }

  // ===== מילונים: סטטוסים =====
  const statusDefs = [
    { name: "תקין", isDefault: true, sortOrder: 0 },
    { name: "בלאי", isWear: true, sortOrder: 1 },
    { name: "פגום", isWear: true, sortOrder: 2 },
    { name: 'שצ"ל (שומש/נצרך)', isConsumed: true, sortOrder: 3 },
    { name: "אבוד", isLoss: true, sortOrder: 4 },
  ];
  const statuses: Record<string, string> = {};
  for (const s of statusDefs) {
    const st = await prisma.itemStatus.create({ data: s });
    statuses[s.name] = st.id;
  }
  const okStatus = statuses["תקין"];

  // ===== מילונים: תדירויות ספירה =====
  await prisma.countFrequency.createMany({
    data: [
      { name: "יומי", intervalDays: 1 },
      { name: "שבועי", intervalDays: 7 },
      { name: "חודשי", intervalDays: 30 },
    ],
  });

  // ===== קטלוג מק"טים (4 שיטות) =====
  const vest = await prisma.itemType.create({
    data: { sku: "LOG-001", name: "אפוד קרמי", categoryId: cats["לוגיסטיקה"], trackingMethod: "QUANTITY", unit: "יח'" },
  });
  const helmet = await prisma.itemType.create({
    data: { sku: "LOG-002", name: "קסדה", categoryId: cats["לוגיסטיקה"], trackingMethod: "QUANTITY", unit: "יח'" },
  });
  const rifle = await prisma.itemType.create({
    data: { sku: "WPN-001", name: 'רובה M4', categoryId: cats['אמל"ח'], trackingMethod: "SERIAL", isSensitive: true, trackLocation: true },
  });
  const radio = await prisma.itemType.create({
    data: { sku: "COM-001", name: "מכשיר קשר", categoryId: cats["תקשוב"], trackingMethod: "SERIAL", isSensitive: true, trackLocation: true },
  });
  const explosive = await prisma.itemType.create({
    data: { sku: "DEM-001", name: "מטעני חבלה", categoryId: cats["חבלה"], trackingMethod: "LOT", unit: "יח'" },
  });
  // ערכה: ערכת חפ"ק = קשר + 2 אפודים
  const kitType = await prisma.itemType.create({
    data: { sku: "KIT-001", name: 'ערכת חפ"ק', categoryId: cats["תקשוב"], trackingMethod: "KIT" },
  });
  await prisma.kitComponent.createMany({
    data: [
      { kitItemTypeId: kitType.id, componentTypeId: radio.id, quantity: 1 },
      { kitItemTypeId: kitType.id, componentTypeId: vest.id, quantity: 2 },
    ],
  });

  // ===== מלאי התחלתי במחסן הגדודי =====
  await prisma.stockBalance.createMany({
    data: [
      { itemTypeId: vest.id, holderId: warehouse.id, statusId: okStatus, quantity: 200 },
      { itemTypeId: helmet.id, holderId: warehouse.id, statusId: okStatus, quantity: 180 },
    ],
  });
  // רובים סריאליים במחסן
  for (let i = 1; i <= 10; i++) {
    await prisma.serialUnit.create({
      data: {
        itemTypeId: rifle.id,
        serialNumber: `M4-${1000 + i}`,
        statusId: okStatus,
        currentHolderId: warehouse.id,
      },
    });
  }
  // מכשירי קשר סריאליים במחסן
  for (let i = 1; i <= 8; i++) {
    await prisma.serialUnit.create({
      data: {
        itemTypeId: radio.id,
        serialNumber: `RAD-${200 + i}`,
        statusId: okStatus,
        currentHolderId: warehouse.id,
      },
    });
  }
  // אצוות חבלה
  await prisma.serialUnit.create({
    data: { itemTypeId: explosive.id, serialNumber: "LOT-A-2026", lotQuantity: 50, statusId: okStatus, currentHolderId: warehouse.id },
  });

  // ===== נשק בנשקייה =====
  for (let i = 1; i <= 6; i++) {
    await prisma.serialUnit.create({
      data: {
        itemTypeId: rifle.id,
        serialNumber: `M4-${2000 + i}`,
        statusId: okStatus,
        currentHolderId: armory.id,
      },
    });
  }

  // ===== חיילים =====
  const soldierData = [
    { fullName: "דני כהן", personalNumber: "8000001", phone: "0501111111", companyId: companyA.id },
    { fullName: "אבי לוי", personalNumber: "8000002", phone: "0502222222", companyId: companyA.id },
    { fullName: "משה ישראלי", personalNumber: "8000003", phone: "0503333333", companyId: companyB.id },
    { fullName: "יוסי מזרחי", personalNumber: "8000004", phone: "0504444444", companyId: companyB.id },
  ];
  for (const s of soldierData) await prisma.soldier.create({ data: s });

  console.log("✅ seed הושלם.");
  console.log("   משתמשים (סיסמה לכולם: 123456): admin, klag, raspa, raspb, armory, magad");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
