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
    if (!user.holderId) return { error: "אינך משויך למחסן/פלוגה" };
    const itemTypeId = String(formData.get("itemTypeId") || "");
    const locationId = String(formData.get("locationId") || "");
    const holderId = user.holderId;

    if (!itemTypeId) return { error: "חסר פריט" };

    if (!locationId) {
      // מחיקה — אם המיקום ריק, מסירים את הקישור
      await prisma.itemHolderLocation.deleteMany({ where: { itemTypeId, holderId } });
      await audit(user.id, "DELETE", "ItemHolderLocation", `${itemTypeId}@${holderId}`);
    } else {
      // ודא שהמיקום שייך ל-holder הנכון
      const loc = await prisma.storageLocation.findUnique({ where: { id: locationId } });
      if (!loc || loc.holderId !== holderId) return { error: "מיקום לא נמצא" };
      await prisma.itemHolderLocation.upsert({
        where: { itemTypeId_holderId: { itemTypeId, holderId } },
        create: { itemTypeId, holderId, locationId },
        update: { locationId },
      });
      await audit(user.id, "UPSERT", "ItemHolderLocation", `${itemTypeId}@${holderId}`, { locationId });
    }
    revalidatePath("/locations");
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
