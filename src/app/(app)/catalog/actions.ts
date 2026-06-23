"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";
import type { TrackingMethod, ItemAssociation, SignMode } from "@/generated/prisma";

export async function saveItemType(formData: FormData) {
  const user = await requireCapability("catalog.manage");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const sku = String(formData.get("sku") || "").trim() || null; // אופציונלי
  const name = String(formData.get("name") || "").trim();
  const categoryId = String(formData.get("categoryId") || "") || null;
  // שיטות ניהול: כמותי/פרטני/אצווה (ללא ערכה)
  let trackingMethod = String(formData.get("trackingMethod") || "QUANTITY") as TrackingMethod;
  if (trackingMethod === "KIT") trackingMethod = "QUANTITY";
  const unit = String(formData.get("unit") || "יח'").trim() || "יח'";
  const association = String(formData.get("association") || "MILITARY") as ItemAssociation;
  const signMode = String(formData.get("signMode") || "COMPANY") as SignMode;
  const isDonated = association !== "MILITARY";
  const homeLocationId = String(formData.get("homeLocationId") || "") || null;
  const trackExpiry = formData.get("trackExpiry") === "on";
  // תמונת מוצר (data-URL, אופציונלי). "__CLEAR__" = הסרת תמונה קיימת.
  const rawImage = String(formData.get("imageData") || "");
  const imageData =
    rawImage === "__CLEAR__" ? null : rawImage.startsWith("data:image") ? rawImage : undefined;

  if (!name) return;

  const base = { sku, name, categoryId, trackingMethod, unit, association, signMode, isDonated, homeLocationId, trackExpiry };
  const data = imageData !== undefined ? { ...base, imageData } : base;
  if (id) {
    await prisma.itemType.update({ where: { id }, data });
  } else {
    await prisma.itemType.create({ data: { ...data, battalionId: bId } });
  }
  await audit(user.id, id ? "UPDATE" : "CREATE", "ItemType", id || name);
  revalidatePath("/items");
  revalidatePath("/catalog");
}

export async function archiveItemType(formData: FormData) {
  const user = await requireCapability("catalog.manage");
  const id = String(formData.get("id") || "");
  const item = await prisma.itemType.findUnique({ where: { id }, select: { battalionId: true } });
  if (!item || item.battalionId !== user.battalionId) return;
  await prisma.itemType.update({ where: { id }, data: { active: false } });
  await audit(user.id, "ARCHIVE", "ItemType", id);
  revalidatePath("/items");
  revalidatePath("/catalog");
}

export async function restoreItemType(formData: FormData) {
  const user = await requireCapability("catalog.manage");
  const id = String(formData.get("id") || "");
  const item = await prisma.itemType.findUnique({ where: { id }, select: { battalionId: true } });
  if (!item || item.battalionId !== user.battalionId) return;
  await prisma.itemType.update({ where: { id }, data: { active: true } });
  await audit(user.id, "RESTORE", "ItemType", id);
  revalidatePath("/items");
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
