"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

export async function saveLocation(formData: FormData) {
  const user = await requireCapability("locations.manage");
  if (!user.holderId) return;
  const id = String(formData.get("id") || "");
  const column = String(formData.get("column") || "").trim();
  const row = String(formData.get("row") || "").trim();
  const label = String(formData.get("label") || "").trim() || null;
  if (!column || !row) return;

  if (id) {
    const existing = await prisma.storageLocation.findUnique({ where: { id }, select: { holderId: true } });
    if (!existing || existing.holderId !== user.holderId) return;
    await prisma.storageLocation.update({ where: { id }, data: { column, row, label } });
  } else {
    // מניעת כפילות
    const exists = await prisma.storageLocation.findFirst({ where: { holderId: user.holderId, column, row } });
    if (exists) return;
    await prisma.storageLocation.create({ data: { holderId: user.holderId, column, row, label } });
  }
  await audit(user.id, id ? "UPDATE" : "CREATE", "StorageLocation", `${column}-${row}`);
  revalidatePath("/locations");
}

/**
 * 🆕 הגדרת/עדכון מיקום פריט בתוך המידוף של holder ספציפי.
 * מאפשר אותו פריט (לדוגמה: סק"ש) להיות מאוחסן במיקומים שונים בכל מחסן/פלוגה.
 */
export async function setItemLocation(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireCapability("locations.manage");
    const itemTypeId = String(formData.get("itemTypeId") || "");
    const locationId = String(formData.get("locationId") || "");
    // ⚠️ מפ"מ יכול לבחור holderId ספציפי מהממשק; אחרים — רק שלהם
    const overrideHolderId = String(formData.get("holderId") || "");
    const isMafam = user.isAdmin;
    const holderId = overrideHolderId && isMafam ? overrideHolderId : user.holderId;
    if (!holderId) return { error: "אינך משויך למחסן/פלוגה" };

    if (!itemTypeId) return { error: "חסר פריט" };

    // אבטחה: ודא שה-holder שייך לאותו גדוד
    const targetHolder = await prisma.holder.findUnique({ where: { id: holderId }, select: { battalionId: true } });
    if (!targetHolder || targetHolder.battalionId !== user.battalionId) return { error: "מחסן לא נמצא" };

    if (!locationId) {
      await prisma.itemHolderLocation.deleteMany({ where: { itemTypeId, holderId } });
      await audit(user.id, "DELETE", "ItemHolderLocation", `${itemTypeId}@${holderId}`);
    } else {
      const loc = await prisma.storageLocation.findUnique({ where: { id: locationId } });
      if (!loc || loc.holderId !== holderId) return { error: "מיקום לא נמצא במחסן שנבחר" };
      await prisma.itemHolderLocation.upsert({
        where: { itemTypeId_holderId: { itemTypeId, holderId } },
        create: { itemTypeId, holderId, locationId },
        update: { locationId },
      });
      await audit(user.id, "UPSERT", "ItemHolderLocation", `${itemTypeId}@${holderId}`, { locationId });
    }
    revalidatePath("/locations");
    revalidatePath("/items");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function deleteLocation(formData: FormData) {
  const user = await requireCapability("locations.manage");
  const id = String(formData.get("id") || "");
  const existing = await prisma.storageLocation.findUnique({ where: { id }, select: { holderId: true } });
  if (!existing || existing.holderId !== user.holderId) return;
  const inUse =
    (await prisma.serialUnit.count({ where: { locationId: id } })) +
    (await prisma.stockBalance.count({ where: { locationId: id } }));
  if (inUse > 0) return;
  await prisma.storageLocation.delete({ where: { id } });
  await audit(user.id, "DELETE", "StorageLocation", id);
  revalidatePath("/locations");
}

// ===================================================================
// 📍 EquipmentLocation - מיקומי ציוד בשטח (כשהגדוד מופעל)
// ===================================================================

/** הוספת/עדכון מיקום ציוד בpierwszym holder (פלוגה/מחסן) */
export async function saveEquipmentLocation(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireCapability("locations.manage");
    if (!user.battalionId) return { error: "אינך משויך לגדוד" };
    const id = String(formData.get("id") || "");
    const holderId = String(formData.get("holderId") || "") || user.holderId;
    const name = String(formData.get("name") || "").trim();
    const vehicleSerialUnitId = String(formData.get("vehicleSerialUnitId") || "") || null;
    if (!holderId) return { error: "חסר holder" };
    if (!name) return { error: "חסר שם מיקום" };

    // אבטחה: holder שייך לגדוד של המשתמש
    const holder = await prisma.holder.findUnique({ where: { id: holderId }, select: { battalionId: true } });
    if (!holder || holder.battalionId !== user.battalionId) return { error: "מיקום לא בגדוד" };

    if (id) {
      const existing = await prisma.equipmentLocation.findUnique({ where: { id }, select: { battalionId: true } });
      if (!existing || existing.battalionId !== user.battalionId) return { error: "מיקום לא נמצא" };
      await prisma.equipmentLocation.update({ where: { id }, data: { name, vehicleSerialUnitId } });
    } else {
      // מניעת כפילות בתוך אותו holder
      const exists = await prisma.equipmentLocation.findFirst({ where: { holderId, name: { equals: name, mode: "insensitive" } } });
      if (exists) return { error: `כבר קיים מיקום בשם "${name}"` };
      await prisma.equipmentLocation.create({ data: { battalionId: user.battalionId, holderId, name, vehicleSerialUnitId } });
    }
    await audit(user.id, id ? "UPDATE" : "CREATE", "EquipmentLocation", `${holderId}/${name}`);
    revalidatePath("/locations");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** מחיקה רכה — מעבירה ל-inactive (לא נמחק כדי לשמור היסטוריה ביחידות) */
export async function deleteEquipmentLocation(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireCapability("locations.manage");
    const id = String(formData.get("id") || "");
    const loc = await prisma.equipmentLocation.findUnique({ where: { id } });
    if (!loc || loc.battalionId !== user.battalionId) return { error: "מיקום לא נמצא" };

    // אם יש יחידות שמצביעות אליו - מנתקים אותן ואז מבטלים
    await prisma.$transaction(async (tx) => {
      await tx.serialUnit.updateMany({ where: { equipmentLocationId: id }, data: { equipmentLocationId: null } });
      await tx.equipmentLocation.update({ where: { id }, data: { active: false } });
    });
    await audit(user.id, "DELETE", "EquipmentLocation", id);
    revalidatePath("/locations");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** 🆕 העברת כמות בין מיקומים פיזיים של אותו (פריט × מחזיק × סטטוס).
 *  ⚠️ אם היעד כבר קיים — מתאחד; אם המקור מתרוקן (ומיקום מוגדר) — נמחק.
 *  משמש גם כדי לשנות מיקום של שורה: from=הנוכחי, to=החדש, quantity=הכל. */
export async function moveStockToLocation(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireCapability("locations.manage");
    if (!user.battalionId) return { error: "אינך משויך לגדוד" };
    const stockBalanceId = String(formData.get("stockBalanceId") || "");
    const toLocationIdRaw = String(formData.get("toLocationId") || "");
    const toLocationId = toLocationIdRaw === "" ? null : toLocationIdRaw;
    const quantity = parseInt(String(formData.get("quantity") || "0"), 10);
    if (!stockBalanceId) return { error: "חסר מזהה שורה" };
    if (!quantity || quantity <= 0) return { error: "כמות חייבת להיות חיובית" };

    const sb = await prisma.stockBalance.findUnique({
      where: { id: stockBalanceId },
      select: { id: true, battalionId: true, itemTypeId: true, holderId: true, statusId: true, equipmentLocationId: true, quantity: true },
    });
    if (!sb || sb.battalionId !== user.battalionId) return { error: "מלאי לא בגדוד" };
    if (sb.equipmentLocationId === toLocationId) return { error: "המיקום זהה" };
    if (toLocationId) {
      const loc = await prisma.equipmentLocation.findUnique({ where: { id: toLocationId }, select: { battalionId: true } });
      if (!loc || loc.battalionId !== user.battalionId) return { error: "מיקום יעד לא נמצא" };
    }
    if (quantity > sb.quantity) return { error: `אין מספיק במקור (זמין: ${sb.quantity})` };

    await prisma.$transaction(async (tx) => {
      const fromNext = sb.quantity - quantity;
      if (fromNext === 0 && sb.equipmentLocationId !== null) {
        await tx.stockBalance.delete({ where: { id: sb.id } });
      } else {
        await tx.stockBalance.update({ where: { id: sb.id }, data: { quantity: fromNext } });
      }
      const target = await tx.stockBalance.findFirst({
        where: {
          itemTypeId: sb.itemTypeId, holderId: sb.holderId, statusId: sb.statusId,
          equipmentLocationId: toLocationId,
        },
      });
      if (target) {
        await tx.stockBalance.update({ where: { id: target.id }, data: { quantity: target.quantity + quantity } });
      } else {
        await tx.stockBalance.create({
          data: {
            battalionId: user.battalionId!,
            itemTypeId: sb.itemTypeId, holderId: sb.holderId, statusId: sb.statusId,
            equipmentLocationId: toLocationId, quantity,
          },
        });
      }
    });
    await audit(user.id, "MOVE_STOCK_LOCATION", "StockBalance", stockBalanceId, {
      from: sb.equipmentLocationId, to: toLocationId, quantity,
    });
    revalidatePath("/my-inventory");
    revalidatePath("/my-inventory/locations");
    revalidatePath("/stock");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** 🆕 הגדרת מיקום ציוד לכמות במלאי הפלוגה (StockBalance) — שינוי מיקום של שורה שלמה.
 *  שונה מ-move: אם היעד קיים, נכשל במקום למזג. שימוש בעיקר כברירת מחדל למיקום של שורה ללא מיקום.
 *  📍 לפיצול בין מיקומים השתמש ב-moveStockToLocation. */
export async function setStockEquipmentLocation(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireCapability("locations.manage");
    const stockBalanceId = String(formData.get("stockBalanceId") || "");
    const equipmentLocationId = String(formData.get("equipmentLocationId") || "") || null;
    const sb = await prisma.stockBalance.findUnique({
      where: { id: stockBalanceId },
      select: { battalionId: true, itemTypeId: true, holderId: true, statusId: true, equipmentLocationId: true, quantity: true },
    });
    if (!sb || sb.battalionId !== user.battalionId) return { error: "מלאי לא בגדוד" };
    if (equipmentLocationId) {
      const loc = await prisma.equipmentLocation.findUnique({ where: { id: equipmentLocationId }, select: { battalionId: true } });
      if (!loc || loc.battalionId !== user.battalionId) return { error: "מיקום לא נמצא" };
    }
    // אם יעד קיים → ממזג (משתמש ב-moveStockToLocation מוזרם)
    const target = await prisma.stockBalance.findFirst({
      where: {
        itemTypeId: sb.itemTypeId, holderId: sb.holderId, statusId: sb.statusId,
        equipmentLocationId: equipmentLocationId,
        NOT: { id: stockBalanceId },
      },
    });
    if (target) {
      await prisma.$transaction(async (tx) => {
        await tx.stockBalance.update({ where: { id: target.id }, data: { quantity: target.quantity + sb.quantity } });
        await tx.stockBalance.delete({ where: { id: stockBalanceId } });
      });
    } else {
      await prisma.stockBalance.update({ where: { id: stockBalanceId }, data: { equipmentLocationId } });
    }
    await audit(user.id, "UPDATE_LOCATION", "StockBalance", stockBalanceId, { equipmentLocationId, merged: !!target });
    revalidatePath("/my-inventory");
    revalidatePath("/my-inventory/locations");
    revalidatePath("/stock");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/**
 * 🆕 הגדרת/עדכון מיקום ציוד כמותי שחתום על חייל.
 * מקבל רשימת (locationId, qty) - מחליף את כל ה-rows הקיימים של (soldier, item, status).
 * הסכום חייב להיות שווה לכמות החתומה.
 */
export async function setSoldierItemPlacements(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireCapability("locations.manage");
    if (!user.battalionId) return { error: "אינך משויך לגדוד" };
    const soldierId = String(formData.get("soldierId") || "");
    const itemTypeId = String(formData.get("itemTypeId") || "");
    const statusId = String(formData.get("statusId") || "");
    const placementsRaw = String(formData.get("placements") || "");
    if (!soldierId || !itemTypeId || !statusId) return { error: "חסרים פרמטרים" };

    // placements = JSON של [{equipmentLocationId, quantity}]
    let placements: { equipmentLocationId: string; quantity: number }[] = [];
    try {
      placements = JSON.parse(placementsRaw);
    } catch { return { error: "פורמט שגוי" }; }

    // אבטחה: החייל בגדוד של המשתמש
    const soldier = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { battalionId: true, companyId: true } });
    if (!soldier || soldier.battalionId !== user.battalionId) return { error: "חייל לא נמצא" };

    // 🛡️ הסכום לא יכול להיות גדול מהכמות החתומה
    const lines = await prisma.transferLine.findMany({
      where: {
        transfer: { battalionId: user.battalionId, status: "COMPLETED", type: { in: ["SIGNOUT", "CHECKIN"] }, toSoldierId: soldierId },
        itemTypeId, statusId, serialUnitId: null,
      },
      include: { transfer: { select: { type: true } } },
    });
    const signedQty = lines.reduce((s, l) => s + (l.transfer.type === "SIGNOUT" ? l.quantity : -l.quantity), 0);
    const totalToPlace = placements.reduce((s, p) => s + (p.quantity || 0), 0);
    if (totalToPlace > signedQty) {
      return { error: `סך המיקומים (${totalToPlace}) חורג מהכמות החתומה (${signedQty})` };
    }
    if (placements.some((p) => p.quantity < 0)) return { error: "כמות לא יכולה להיות שלילית" };

    await prisma.$transaction(async (tx) => {
      await tx.soldierItemLocation.deleteMany({ where: { soldierId, itemTypeId, statusId } });
      for (const p of placements) {
        if (p.quantity <= 0 || !p.equipmentLocationId) continue;
        await tx.soldierItemLocation.create({
          data: {
            battalionId: user.battalionId!,
            soldierId, itemTypeId, statusId,
            equipmentLocationId: p.equipmentLocationId,
            quantity: p.quantity,
          },
        });
      }
    });
    await audit(user.id, "UPSERT", "SoldierItemLocation", `${soldierId}/${itemTypeId}/${statusId}`, { placements });
    revalidatePath("/my-inventory");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** הגדרת מיקום ציוד ליחידה סריאלית - גם חייל יכול דרך הtoken של החתימה שלו */
export async function setUnitEquipmentLocation(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireCapability("locations.manage");
    const serialUnitId = String(formData.get("serialUnitId") || "");
    const equipmentLocationId = String(formData.get("equipmentLocationId") || "") || null;
    const su = await prisma.serialUnit.findUnique({ where: { id: serialUnitId }, select: { battalionId: true } });
    if (!su || su.battalionId !== user.battalionId) return { error: "יחידה לא בגדוד" };

    if (equipmentLocationId) {
      const loc = await prisma.equipmentLocation.findUnique({ where: { id: equipmentLocationId }, select: { battalionId: true } });
      if (!loc || loc.battalionId !== user.battalionId) return { error: "מיקום לא נמצא" };
    }
    await prisma.serialUnit.update({ where: { id: serialUnitId }, data: { equipmentLocationId } });
    await audit(user.id, "UPDATE_LOCATION", "SerialUnit", serialUnitId, { equipmentLocationId });
    revalidatePath("/signatures");
    revalidatePath("/stock");
    revalidatePath("/my-inventory");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}
