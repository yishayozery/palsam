"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { adjustQuantity, defaultStatusId } from "@/lib/inventory";

/** הוספת פריט תרומה + מלאי, בבעלות המחזיק של המשתמש (פלוגה/מחסן) */
export async function addDonation(formData: FormData) {
  const user = await requireCapability("donations.manage");
  const bId = user.battalionId!;
  if (!user.holderId) return;
  const name = String(formData.get("name") || "").trim();
  const unit = String(formData.get("unit") || "יח'").trim() || "יח'";
  const quantity = Math.max(0, parseInt(String(formData.get("quantity") || "0"), 10) || 0);
  const signable = formData.get("signable") === "on";
  if (!name) return;

  await prisma.$transaction(async (tx) => {
    const item = await tx.itemType.create({
      data: {
        battalionId: bId, sku: `DON-${nanoid(6).toUpperCase()}`, name,
        trackingMethod: "QUANTITY", unit, isDonated: true, signable,
        ownerHolderId: user.holderId,
      },
    });
    if (quantity > 0) {
      const statusId = await defaultStatusId(tx, bId);
      await adjustQuantity(tx, bId, item.id, user.holderId!, statusId, quantity);
    }
  });

  await audit(user.id, "CREATE_DONATION", "ItemType", name, { signable });
  revalidatePath("/donations");
  revalidatePath("/inventory");
}

/** עדכון כמות תרומה */
export async function setDonationQty(formData: FormData) {
  const user = await requireCapability("donations.manage");
  const bId = user.battalionId!;
  if (!user.holderId) return;
  const itemTypeId = String(formData.get("itemTypeId") || "");
  const target = Math.max(0, parseInt(String(formData.get("quantity") || "0"), 10) || 0);

  await prisma.$transaction(async (tx) => {
    const statusId = await defaultStatusId(tx, bId);
    const existing = await tx.stockBalance.findFirst({ where: { itemTypeId, holderId: user.holderId! } });
    const cur = existing?.quantity ?? 0;
    await adjustQuantity(tx, bId, itemTypeId, user.holderId!, statusId, target - cur);
  });
  await audit(user.id, "UPDATE_DONATION", "ItemType", itemTypeId, { quantity: target });
  revalidatePath("/donations");
}

export async function toggleSignable(formData: FormData) {
  const user = await requireCapability("donations.manage");
  const itemTypeId = String(formData.get("itemTypeId") || "");
  const it = await prisma.itemType.findUnique({ where: { id: itemTypeId } });
  if (!it || it.ownerHolderId !== user.holderId) return;
  await prisma.itemType.update({ where: { id: itemTypeId }, data: { signable: !it.signable } });
  await audit(user.id, "UPDATE_DONATION", "ItemType", itemTypeId, { signable: !it.signable });
  revalidatePath("/donations");
}
