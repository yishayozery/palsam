/**
 * 📦 טעינת ציוד + רכבים לגדסם 4 מ-equipment-merged.json
 *
 * שימוש:
 *   npx tsx scripts/seed-equipment.ts
 *
 * מה הסקריפט עושה:
 *   1. יוצר EquipmentLocations (מיקומי מחסן/מכולה) per company
 *   2. יוצר ItemTypes (upsert by name) עם סיווג צבאי/תרומה
 *   3. יוצר StockBalance per (item, holder, status, location)
 *   4. יוצר סוגי רכב (ItemType SERIAL) + SerialUnits עם ז"צ
 */

import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();
const BATTALION_CODE = "5554";

type ItemRow = { name: string; qty: number; association: "MILITARY" | "DONATION_COMPANY" };
type Location = { name: string; items: ItemRow[] };
type Company = { sheet: string; companyName: string; locations: Location[] };
type Vehicle = { type: string; serialNumber: string; notes: string | null; companyName: string };
type Input = { companies: Company[]; vehicles: Vehicle[] };

async function main() {
  const battalion = await prisma.battalion.findUnique({ where: { code: BATTALION_CODE } });
  if (!battalion) { console.error("❌ גדוד לא נמצא"); process.exit(1); }
  const bId = battalion.id;
  console.log(`✅ גדוד: ${battalion.name}`);

  const input: Input = JSON.parse(readFileSync("4/equipment-merged.json", "utf-8"));

  // Get or create "תקין" status
  let okStatus = await prisma.itemStatus.findFirst({ where: { battalionId: bId, name: "תקין" } });
  if (!okStatus) {
    okStatus = await prisma.itemStatus.create({
      data: { battalionId: bId, name: "תקין", sortOrder: 0 },
    });
    console.log("  ✨ סטטוס: תקין");
  }

  // Get or create default category
  let defaultCategory = await prisma.category.findFirst({ where: { battalionId: bId, name: "ציוד" } });
  if (!defaultCategory) {
    defaultCategory = await prisma.category.create({
      data: { battalionId: bId, name: "ציוד", warehouseType: "EQUIPMENT" },
    });
    console.log("  ✨ קטגוריה: ציוד");
  }
  let donationCategory = await prisma.category.findFirst({ where: { battalionId: bId, name: "תרומות" } });
  if (!donationCategory) {
    donationCategory = await prisma.category.create({
      data: { battalionId: bId, name: "תרומות", warehouseType: "EQUIPMENT" },
    });
    console.log("  ✨ קטגוריה: תרומות");
  }

  // Load company holders
  const companies = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "COMPANY" },
    select: { id: true, name: true },
  });
  const companyMap = new Map(companies.map(c => [c.name, c.id]));

  // Main equipment warehouse for StockBalance holder
  const equipWarehouse = await prisma.holder.findFirst({
    where: { battalionId: bId, kind: "WAREHOUSE", warehouseType: "EQUIPMENT" },
  });
  if (!equipWarehouse) { console.error("❌ מחסן ציוד לא נמצא"); process.exit(1); }

  // Cache for ItemType upsert
  const itemTypeCache = new Map<string, string>(); // name → id

  async function getOrCreateItemType(name: string, association: "MILITARY" | "DONATION_COMPANY"): Promise<string> {
    const cached = itemTypeCache.get(name);
    if (cached) return cached;

    let item = await prisma.itemType.findFirst({
      where: { battalionId: bId, name },
      select: { id: true },
    });
    if (!item) {
      const isDonation = association === "DONATION_COMPANY";
      item = await prisma.itemType.create({
        data: {
          battalionId: bId,
          name,
          trackingMethod: "QUANTITY",
          categoryId: isDonation ? donationCategory!.id : defaultCategory!.id,
          association,
          isDonated: isDonation,
          signable: false,
        },
      });
    }
    itemTypeCache.set(name, item.id);
    return item.id;
  }

  // Process each company
  let totalItems = 0;
  let totalBalances = 0;
  let totalLocations = 0;

  for (const comp of input.companies) {
    const holderId = companyMap.get(comp.companyName);
    if (!holderId) {
      console.error(`  ⚠️ פלוגה "${comp.companyName}" לא נמצאה — דולג`);
      continue;
    }
    console.log(`\n📂 ${comp.companyName}`);

    for (const loc of comp.locations) {
      // Create EquipmentLocation for this holder
      let eqLoc = await prisma.equipmentLocation.findFirst({
        where: { holderId, name: loc.name },
      });
      if (!eqLoc) {
        eqLoc = await prisma.equipmentLocation.create({
          data: { battalionId: bId, holderId, name: loc.name },
        });
        totalLocations++;
        console.log(`  📍 מיקום: ${loc.name}`);
      }

      for (const item of loc.items) {
        const itemTypeId = await getOrCreateItemType(item.name, item.association);
        totalItems++;

        // Upsert StockBalance — holder is the company, location is the container
        const existing = await prisma.stockBalance.findFirst({
          where: {
            itemTypeId,
            holderId,
            statusId: okStatus!.id,
            equipmentLocationId: eqLoc.id,
          },
        });
        if (existing) {
          await prisma.stockBalance.update({
            where: { id: existing.id },
            data: { quantity: item.qty },
          });
        } else {
          await prisma.stockBalance.create({
            data: {
              battalionId: bId,
              itemTypeId,
              holderId,
              statusId: okStatus!.id,
              equipmentLocationId: eqLoc.id,
              quantity: item.qty,
            },
          });
        }
        totalBalances++;
      }
    }
  }

  console.log(`\n✅ ציוד: ${itemTypeCache.size} סוגי פריטים, ${totalBalances} שורות מלאי, ${totalLocations} מיקומים`);

  // === Vehicles ===
  console.log("\n🚗 רכבים:");

  // Get or create VEHICLES category
  let vehCategory = await prisma.category.findFirst({ where: { battalionId: bId, name: "רכבים" } });
  if (!vehCategory) {
    vehCategory = await prisma.category.create({
      data: { battalionId: bId, name: "רכבים", warehouseType: "VEHICLES" },
    });
  }

  const vehicleWarehouse = await prisma.holder.findFirst({
    where: { battalionId: bId, kind: "WAREHOUSE", warehouseType: "VEHICLES" },
  });
  if (!vehicleWarehouse) { console.error("❌ מחסן רכבים לא נמצא"); process.exit(1); }

  // Group vehicles by type
  const vehiclesByType = new Map<string, Vehicle[]>();
  for (const v of input.vehicles) {
    if (!vehiclesByType.has(v.type)) vehiclesByType.set(v.type, []);
    vehiclesByType.get(v.type)!.push(v);
  }

  let totalVehicles = 0;
  for (const [typeName, vehicles] of vehiclesByType) {
    // Create vehicle ItemType (SERIAL tracked)
    let vehType = await prisma.itemType.findFirst({
      where: { battalionId: bId, name: typeName },
    });
    if (!vehType) {
      vehType = await prisma.itemType.create({
        data: {
          battalionId: bId,
          name: typeName,
          trackingMethod: "SERIAL",
          categoryId: vehCategory!.id,
          association: "MILITARY",
          signable: false,
        },
      });
      console.log(`  ✨ סוג רכב: ${typeName}`);
    }

    // Create SerialUnit for each vehicle
    for (const v of vehicles) {
      const existing = await prisma.serialUnit.findFirst({
        where: { battalionId: bId, serialNumber: v.serialNumber },
      });
      if (!existing) {
        const holderId = companyMap.get(v.companyName) || vehicleWarehouse.id;
        await prisma.serialUnit.create({
          data: {
            battalionId: bId,
            itemTypeId: vehType.id,
            serialNumber: v.serialNumber,
            statusId: okStatus!.id,
            currentHolderId: holderId,
          },
        });
        totalVehicles++;
        const noteStr = v.notes ? ` — ${v.notes}` : "";
        console.log(`  🚛 ${typeName} ז"צ ${v.serialNumber}${noteStr}`);
      }
    }
  }

  console.log(`\n✅ רכבים: ${vehiclesByType.size} סוגים, ${totalVehicles} כלים`);

  // Final summary
  const summary = await Promise.all([
    prisma.itemType.count({ where: { battalionId: bId } }),
    prisma.stockBalance.count({ where: { battalionId: bId } }),
    prisma.serialUnit.count({ where: { battalionId: bId } }),
    prisma.equipmentLocation.count({ where: { battalionId: bId } }),
  ]);
  console.log(`\n📊 סך הכל בגדסם 4:`);
  console.log(`   סוגי פריטים: ${summary[0]}`);
  console.log(`   שורות מלאי: ${summary[1]}`);
  console.log(`   רכבים (SerialUnit): ${summary[2]}`);
  console.log(`   מיקומי ציוד: ${summary[3]}`);
}

main()
  .catch((e) => { console.error("❌ שגיאה:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
