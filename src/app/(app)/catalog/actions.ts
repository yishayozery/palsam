"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";
import type { TrackingMethod } from "@/generated/prisma";

export async function saveItemType(formData: FormData) {
  const user = await requireCapability("catalog.manage");
  const id = String(formData.get("id") || "");
  const sku = String(formData.get("sku") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const categoryId = String(formData.get("categoryId") || "");
  const trackingMethod = String(formData.get("trackingMethod") || "QUANTITY") as TrackingMethod;
  const unit = String(formData.get("unit") || "יח'").trim() || "יח'";
  const isSensitive = formData.get("isSensitive") === "on";
  const trackLocation = formData.get("trackLocation") === "on";

  if (!sku || !name || !categoryId) return;

  const data = { sku, name, categoryId, trackingMethod, unit, isSensitive, trackLocation };
  if (id) {
    await prisma.itemType.update({ where: { id }, data });
  } else {
    await prisma.itemType.create({ data });
  }
  await audit(user.id, id ? "UPDATE" : "CREATE", "ItemType", id || sku);
  revalidatePath("/catalog");
}

export async function deleteItemType(formData: FormData) {
  const user = await requireCapability("catalog.manage");
  const id = String(formData.get("id") || "");
  const inUse =
    (await prisma.serialUnit.count({ where: { itemTypeId: id } })) +
    (await prisma.stockBalance.count({ where: { itemTypeId: id } }));
  if (inUse > 0) {
    // לא מוחקים פריט בשימוש — מסמנים כלא פעיל
    await prisma.itemType.update({ where: { id }, data: { active: false } });
  } else {
    await prisma.kitComponent.deleteMany({ where: { kitItemTypeId: id } });
    await prisma.itemType.delete({ where: { id } });
  }
  await audit(user.id, "DELETE", "ItemType", id);
  revalidatePath("/catalog");
}

// ---------- רכיבי ערכה (BOM) ----------
export async function addKitComponent(formData: FormData) {
  const user = await requireCapability("catalog.manage");
  const kitItemTypeId = String(formData.get("kitItemTypeId") || "");
  const componentTypeId = String(formData.get("componentTypeId") || "");
  const quantity = Math.max(1, parseInt(String(formData.get("quantity") || "1"), 10) || 1);
  if (!kitItemTypeId || !componentTypeId) return;
  await prisma.kitComponent.upsert({
    where: { kitItemTypeId_componentTypeId: { kitItemTypeId, componentTypeId } },
    create: { kitItemTypeId, componentTypeId, quantity },
    update: { quantity },
  });
  await audit(user.id, "UPDATE", "KitComponent", kitItemTypeId);
  revalidatePath("/catalog");
}

export async function removeKitComponent(formData: FormData) {
  await requireCapability("catalog.manage");
  const id = String(formData.get("id") || "");
  await prisma.kitComponent.delete({ where: { id } });
  revalidatePath("/catalog");
}
