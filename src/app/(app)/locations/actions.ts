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
    const isMafam = user.role === "BATTALION_ADMIN";
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
