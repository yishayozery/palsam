/**
 * 📦 קליטת מלאי קיים לפלוגה משובר השאלה
 *
 * שימוש:
 *   npx tsx scripts/load-company-stock.ts <path-to-json>
 *   npx tsx scripts/load-company-stock.ts data/company-stock/hq-agm.json
 *
 * מה הסקריפט עושה:
 *   1. בודק שהגדוד והפלוגה קיימים
 *   2. מוחק את ה-StockBalance הקיים של אותה פלוגה (לא נוגע בקטלוג)
 *   3. מוצא/יוצר קטגוריה (default = "ציוד" עם warehouseType = EQUIPMENT)
 *   4. מוצא את הסטטוס "תקין" של הגדוד
 *   5. עבור כל פריט: upsert ב-ItemType (לפי battalionId+sku)
 *   6. יוצר תעודת INTAKE רב-פריטית (COMPLETED, יעד = הפלוגה)
 *   7. יוצר StockBalance לכל פריט במחזיק הפלוגה
 *
 * פורמט קובץ הקלט:
 *   {
 *     "battalionCode": "CARMELI",
 *     "companyName": "מפקדה/אגם",
 *     "recipientName": "מלאי קיים",
 *     "reason": "...",
 *     "category": "ציוד",
 *     "warehouseType": "EQUIPMENT",
 *     "defaultStatusName": "תקין",
 *     "items": [{ "sku": "...", "name": "...", "quantity": N }, ...]
 *   }
 */

import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

type Input = {
  battalionCode: string;
  companyName: string;
  recipientName: string;
  reason: string;
  category: string;
  warehouseType:
    | "EQUIPMENT" | "COMMS" | "AMMO" | "ARMORY" | "VEHICLES" | "MEDICAL" | "GENERAL";
  defaultStatusName: string;
  items: { sku: string; name: string; quantity: number }[];
};

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("❌ חסר נתיב לקובץ JSON. דוגמה:");
    console.error("   npx tsx scripts/load-company-stock.ts data/company-stock/hq-agm.json");
    process.exit(1);
  }

  const input: Input = JSON.parse(readFileSync(arg, "utf-8"));
  console.log(`📂 נטען קלט: ${arg}`);
  console.log(`   גדוד: ${input.battalionCode} · פלוגה: ${input.companyName}`);
  console.log(`   ${input.items.length} פריטים, סה״כ ${input.items.reduce((s, i) => s + i.quantity, 0)} יחידות`);

  // 1. מציאת הגדוד
  const battalion = await prisma.battalion.findUnique({ where: { code: input.battalionCode } });
  if (!battalion) throw new Error(`גדוד ${input.battalionCode} לא נמצא`);
  const bId = battalion.id;

  // 2. מציאת הפלוגה
  const company = await prisma.holder.findFirst({
    where: { battalionId: bId, kind: "COMPANY", name: input.companyName },
  });
  if (!company) throw new Error(`פלוגה "${input.companyName}" לא נמצאה`);

  // 3. מציאת מנפק (משתמש מערכת / מפ"מ ראשון)
  const adminUser = await prisma.appUser.findFirst({
    where: { battalionId: bId, role: { in: ["BATTALION_ADMIN", "SUPER_ADMIN"] }, active: true },
  });
  if (!adminUser) throw new Error("לא נמצא משתמש מפ\"מ פעיל לפעולה");

  // 4. מציאת/יצירת קטגוריה
  let category = await prisma.category.findFirst({
    where: { battalionId: bId, name: input.category },
  });
  if (!category) {
    category = await prisma.category.create({
      data: { battalionId: bId, name: input.category, warehouseType: input.warehouseType, active: true },
    });
    console.log(`✓ נוצרה קטגוריה "${input.category}"`);
  }

  // 5. מציאת סטטוס ברירת מחדל
  const status = await prisma.itemStatus.findFirst({
    where: { battalionId: bId, name: input.defaultStatusName, active: true },
  }) ?? await prisma.itemStatus.findFirst({
    where: { battalionId: bId, isDefault: true, active: true },
  });
  if (!status) throw new Error("לא נמצא סטטוס ברירת מחדל");

  // 6. מחיקת המלאי הקיים בפלוגה
  const deleted = await prisma.stockBalance.deleteMany({
    where: { battalionId: bId, holderId: company.id },
  });
  console.log(`🗑️  נמחקו ${deleted.count} שורות StockBalance של "${input.companyName}"`);

  // 7. עבור כל פריט: upsert ItemType + create TransferLine + create StockBalance
  let created = 0, updated = 0;
  const transferLinesData: { itemTypeId: string; quantity: number; statusId: string }[] = [];

  for (const item of input.items) {
    const existing = await prisma.itemType.findFirst({
      where: { battalionId: bId, sku: item.sku },
    });
    let itemType;
    if (existing) {
      itemType = await prisma.itemType.update({
        where: { id: existing.id },
        data: {
          name: item.name,
          categoryId: category.id,
          trackingMethod: "QUANTITY",
          unit: "יח'",
          association: "MILITARY",
          signMode: "COMPANY",
          active: true,
        },
      });
      updated++;
    } else {
      itemType = await prisma.itemType.create({
        data: {
          battalionId: bId, sku: item.sku, name: item.name,
          categoryId: category.id,
          trackingMethod: "QUANTITY",
          unit: "יח'",
          association: "MILITARY",
          signMode: "COMPANY",
          active: true,
        },
      });
      created++;
    }
    transferLinesData.push({ itemTypeId: itemType.id, quantity: item.quantity, statusId: status.id });
  }
  console.log(`✓ פריטים: ${created} חדשים, ${updated} עודכנו`);

  // 8. תעודת INTAKE רב-פריטית
  const transfer = await prisma.transfer.create({
    data: {
      battalionId: bId,
      type: "INTAKE",
      status: "COMPLETED",
      toHolderId: company.id,
      externalUnit: "חטיבה",
      externalContact: input.recipientName,
      reason: input.reason,
      createdById: adminUser.id,
      approvedById: adminUser.id,
      approvedAt: new Date(),
      lines: { create: transferLinesData },
    },
  });
  console.log(`✓ נוצרה תעודת INTAKE ${transfer.id.slice(-8).toUpperCase()} עם ${transferLinesData.length} שורות`);

  // 9. StockBalance לכל פריט
  let balancesCreated = 0;
  for (const line of transferLinesData) {
    await prisma.stockBalance.upsert({
      where: {
        itemTypeId_holderId_statusId: {
          itemTypeId: line.itemTypeId, holderId: company.id, statusId: line.statusId,
        },
      },
      create: {
        battalionId: bId, itemTypeId: line.itemTypeId, holderId: company.id,
        statusId: line.statusId, quantity: line.quantity,
      },
      update: { quantity: line.quantity },
    });
    balancesCreated++;
  }
  console.log(`✓ ${balancesCreated} שורות StockBalance נוצרו ב-"${input.companyName}"`);

  console.log("\n🎉 הטעינה הסתיימה בהצלחה!");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ שגיאה:", e);
  process.exit(1);
});
