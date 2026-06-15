/**
 * איפוס מאגר הרכבים - מחיקת קיים + יצירת 21 רכבים חדשים לפי הרשימה.
 * הרצה: npx tsx scripts/reset-vehicles.ts
 */
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

// 21 רכבים - שם פריט, מספר רישוי (=SN)
const VEHICLES: { itemName: string; serialNumber: string }[] = [
  { itemName: "ריאו מכלית סולר", serialNumber: "675490" },
  { itemName: "אושקוש חילוץ והנפה", serialNumber: "684038" },
  { itemName: "האמר מנהלתי", serialNumber: "700242" },
  { itemName: "האמר מנהלתי", serialNumber: "705296" },
  { itemName: "FMTV", serialNumber: "990087" },
  { itemName: "FMTV", serialNumber: "727354" },
  { itemName: "FMTV", serialNumber: "727353" },
  { itemName: "FMTV", serialNumber: "727320" },
  { itemName: "מרצדסבולנס", serialNumber: "561372" },
  { itemName: "אושקוש מכלית סולר", serialNumber: "707216" },
  { itemName: "ריאו מכלית מים", serialNumber: "676719" },
  { itemName: "אושקוש מגבה נע", serialNumber: "627251" },
  { itemName: "האמר סיור", serialNumber: "705419" },
  { itemName: "האמר סיור", serialNumber: "705422" },
  { itemName: "האמר סיור", serialNumber: "705421" },
  { itemName: "האמר סיור", serialNumber: "705846" },
  { itemName: "האמר סיור", serialNumber: "700807" },
  { itemName: "האמר לביא", serialNumber: "704182" },
  { itemName: "האמר לביא", serialNumber: "704178" },
  { itemName: "פורדבולנס", serialNumber: "563099" },
  { itemName: "פורדבולנס", serialNumber: "563078" },
];

async function main() {
  const battalion = await prisma.battalion.findFirst({ where: { code: "CARMELI" } });
  if (!battalion) throw new Error("גדוד CARMELI לא נמצא");

  const vehicleWarehouse = await prisma.holder.findFirst({
    where: { battalionId: battalion.id, kind: "WAREHOUSE", warehouseType: "VEHICLES" },
  });
  if (!vehicleWarehouse) throw new Error("מחסן רכבים לא נמצא");
  console.log(`✓ מחסן רכבים: ${vehicleWarehouse.name}`);

  // סטטוס "תקין" (ברירת מחדל)
  const statusOK = await prisma.itemStatus.findFirst({
    where: { battalionId: battalion.id, isDefault: true, active: true },
  });
  if (!statusOK) throw new Error('סטטוס ברירת מחדל ("תקין"/"כשיר") לא נמצא');
  console.log(`✓ סטטוס ברירת מחדל: ${statusOK.name}`);

  // === שלב 1: מחיקה ===
  console.log("\n🗑️  שלב 1: מחיקת קיים");

  await prisma.$transaction(async (tx) => {
    // 1.1 שיבוצי שבצק
    const delAssigns = await tx.vehicleAssignment.deleteMany({ where: { battalionId: battalion.id } });
    console.log(`  - נמחקו ${delAssigns.count} שיבוצי שבצ"ק`);

    // 1.2 SerialUnits של רכבים (וכל התלויות)
    const oldVehicles = await tx.serialUnit.findMany({
      where: { battalionId: battalion.id, itemType: { category: { warehouseType: "VEHICLES" } } },
      select: { id: true, serialNumber: true, itemTypeId: true },
    });
    const oldUnitIds = oldVehicles.map((v) => v.id);
    console.log(`  - נמצאו ${oldVehicles.length} רכבים ישנים: ${oldVehicles.map((v) => v.serialNumber).join(", ")}`);

    if (oldUnitIds.length > 0) {
      // ניתוק EquipmentLocations שמצביעות לרכבים
      const upd = await tx.equipmentLocation.updateMany({
        where: { vehicleSerialUnitId: { in: oldUnitIds } },
        data: { vehicleSerialUnitId: null },
      });
      if (upd.count > 0) console.log(`  - נותקו ${upd.count} EquipmentLocations מרכבים`);

      // מחיקת Signatures שמכילות Transfer שמכיל TransferLine עם SerialUnit רכב
      const linkedTransfers = await tx.transferLine.findMany({
        where: { serialUnitId: { in: oldUnitIds } }, select: { transferId: true },
      });
      const transferIds = [...new Set(linkedTransfers.map((l) => l.transferId))];
      if (transferIds.length > 0) {
        const delSigs = await tx.signature.deleteMany({ where: { transferId: { in: transferIds } } });
        if (delSigs.count > 0) console.log(`  - נמחקו ${delSigs.count} חתימות`);
        const delLines = await tx.transferLine.deleteMany({ where: { serialUnitId: { in: oldUnitIds } } });
        if (delLines.count > 0) console.log(`  - נמחקו ${delLines.count} שורות תעודה`);
        // לא מוחקים את ה-Transfers - אלה רישומי היסטוריה (יישארו ריקים)
      }

      // מחיקת CountLines שמצביעות לרכבים (אם יש)
      const delCountLines = await tx.countLine.deleteMany({ where: { serialUnitId: { in: oldUnitIds } } });
      if (delCountLines.count > 0) console.log(`  - נמחקו ${delCountLines.count} שורות ספירה`);

      // עכשיו אפשר למחוק את ה-SerialUnits
      const delUnits = await tx.serialUnit.deleteMany({ where: { id: { in: oldUnitIds } } });
      console.log(`  - נמחקו ${delUnits.count} SerialUnits`);
    }

    // 1.3 מצא את כל ה-ItemTypes רכב שעומדים להימחק
    const oldItemTypes = await tx.itemType.findMany({
      where: { battalionId: battalion.id, category: { warehouseType: "VEHICLES" } },
      select: { id: true, name: true },
    });
    const oldItemTypeIds = oldItemTypes.map((i) => i.id);

    if (oldItemTypeIds.length > 0) {
      // מחיקת TransferLines שמצביעות עליהם (גם בלי serialUnitId)
      const delLinesByItem = await tx.transferLine.deleteMany({
        where: { itemTypeId: { in: oldItemTypeIds } },
      });
      if (delLinesByItem.count > 0) console.log(`  - נמחקו ${delLinesByItem.count} שורות תעודה נוספות (לפי ItemType)`);

      // מחיקת StockBalance שמצביעות עליהם
      const delBalances = await tx.stockBalance.deleteMany({
        where: { itemTypeId: { in: oldItemTypeIds } },
      });
      if (delBalances.count > 0) console.log(`  - נמחקו ${delBalances.count} שורות StockBalance`);

      // מחיקת CompanyItemBaseline שמצביעות עליהם
      const delBaselines = await tx.companyItemBaseline.deleteMany({
        where: { itemTypeId: { in: oldItemTypeIds } },
      });
      if (delBaselines.count > 0) console.log(`  - נמחקו ${delBaselines.count} שורות בסיס פלוגתי`);

      // מחיקת ItemHolderLocation
      const delHolderLocs = await tx.itemHolderLocation.deleteMany({
        where: { itemTypeId: { in: oldItemTypeIds } },
      });
      if (delHolderLocs.count > 0) console.log(`  - נמחקו ${delHolderLocs.count} מיקומים פר holder`);
    }

    // 1.4 מחיקת ItemTypes רכב
    const delItems = await tx.itemType.deleteMany({
      where: { battalionId: battalion.id, category: { warehouseType: "VEHICLES" } },
    });
    console.log(`  - נמחקו ${delItems.count} ItemTypes רכב`);

    // 1.4 קטגוריות רכב (להחליף בקטגוריה אחת אחידה)
    const delCats = await tx.category.deleteMany({
      where: { battalionId: battalion.id, warehouseType: "VEHICLES" },
    });
    console.log(`  - נמחקו ${delCats.count} קטגוריות`);
  });

  // === שלב 2: יצירה ===
  console.log("\n✨ שלב 2: יצירת רכבים חדשים");

  await prisma.$transaction(async (tx) => {
    // קטגוריה אחת מאוחדת
    const category = await tx.category.create({
      data: { battalionId: battalion.id, name: "רכב", warehouseType: "VEHICLES" },
    });
    console.log(`  ✓ נוצרה קטגוריה: ${category.name}`);

    // יצירת ItemTypes יחודיים
    const uniqueNames = [...new Set(VEHICLES.map((v) => v.itemName))];
    const itemTypeByName = new Map<string, string>();
    let sku = 1;
    for (const name of uniqueNames) {
      const item = await tx.itemType.create({
        data: {
          battalionId: battalion.id,
          categoryId: category.id,
          name,
          sku: `VEH-${String(sku++).padStart(3, "0")}`,
          unit: "יח",
          trackingMethod: "SERIAL",
          signMode: "COMPANY",
          association: "MILITARY",
          signable: true,
          active: true,
        },
      });
      itemTypeByName.set(name, item.id);
    }
    console.log(`  ✓ נוצרו ${uniqueNames.length} ItemTypes רכב: ${uniqueNames.join(", ")}`);

    // יצירת SerialUnits לכל רכב, כולם במחסן הרכבים, לא חתומים
    for (const v of VEHICLES) {
      await tx.serialUnit.create({
        data: {
          battalionId: battalion.id,
          itemTypeId: itemTypeByName.get(v.itemName)!,
          serialNumber: v.serialNumber,
          lotQuantity: 1,
          statusId: statusOK.id,
          currentHolderId: vehicleWarehouse.id,
          signedSoldierId: null,
        },
      });
    }
    console.log(`  ✓ נוצרו ${VEHICLES.length} רכבים, כולם במחסן הרכבים, לא חתומים`);
  });

  // === שלב 3: סיכום ===
  console.log("\n📊 סיכום:");
  const summary = await prisma.itemType.findMany({
    where: { battalionId: battalion.id, category: { warehouseType: "VEHICLES" } },
    include: { _count: { select: { serialUnits: true } } },
    orderBy: { name: "asc" },
  });
  summary.forEach((i) => console.log(`  ${i.name}: ${i._count.serialUnits} יחידות`));
  const total = summary.reduce((s, i) => s + i._count.serialUnits, 0);
  console.log(`  סה"כ: ${total} רכבים`);
}

main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => prisma.$disconnect());
