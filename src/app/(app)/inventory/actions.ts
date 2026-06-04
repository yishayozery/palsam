"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { adjustQuantity } from "@/lib/inventory";

/** המחסן שמנהל המחסן אחראי עליו (holderId), או מחסן לפי טיפוס הפריט */
async function warehouseForItem(battalionId: string, itemTypeId: string, fallbackHolderId: string | null) {
  if (fallbackHolderId) return fallbackHolderId;
  const item = await prisma.itemType.findUnique({ where: { id: itemTypeId }, include: { category: true } });
  if (!item) return null;
  const wh = await prisma.holder.findFirst({
    where: { battalionId, kind: "WAREHOUSE", warehouseType: item.category.warehouseType },
  });
  return wh?.id ?? null;
}

/** קליטת מלאי חדש מהחטיבה למחסן */
export async function intakeStock(formData: FormData) {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const itemTypeId = String(formData.get("itemTypeId") || "");
  const statusId = String(formData.get("statusId") || "");
  const reason = String(formData.get("reason") || "").trim() || "קליטת מלאי חדש מהחטיבה";

  const item = await prisma.itemType.findUnique({ where: { id: itemTypeId } });
  if (!item) return;
  const warehouseId = await warehouseForItem(bId, itemTypeId, user.holderId);
  if (!warehouseId) return;

  await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: { battalionId: bId, type: "INTAKE", status: "COMPLETED", toHolderId: warehouseId, reason, createdById: user.id, approvedById: user.id, approvedAt: new Date() },
    });

    if (item.trackingMethod === "QUANTITY") {
      const qty = Math.max(1, parseInt(String(formData.get("quantity") || "0"), 10) || 0);
      await adjustQuantity(tx, bId, itemTypeId, warehouseId, statusId, qty);
      await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId, quantity: qty, statusId } });
    } else if (item.trackingMethod === "SERIAL") {
      const serials = String(formData.get("serials") || "").split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
      for (const sn of serials) {
        await tx.serialUnit.create({ data: { battalionId: bId, itemTypeId, serialNumber: sn, statusId, currentHolderId: warehouseId } });
        await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId, quantity: 1, statusId } });
      }
    } else if (item.trackingMethod === "LOT") {
      const lotNumber = String(formData.get("lotNumber") || "").trim();
      const lotQty = Math.max(1, parseInt(String(formData.get("quantity") || "0"), 10) || 0);
      if (lotNumber) {
        await tx.serialUnit.create({ data: { battalionId: bId, itemTypeId, serialNumber: lotNumber, lotQuantity: lotQty, statusId, currentHolderId: warehouseId } });
        await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId, quantity: lotQty, statusId } });
      }
    }
  });

  await audit(user.id, "INTAKE", "ItemType", itemTypeId);
  revalidatePath("/inventory");
}

/** גריעת מלאי מול החטיבה */
export async function writeOffStock(formData: FormData) {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const itemTypeId = String(formData.get("itemTypeId") || "");
  const statusId = String(formData.get("statusId") || "");
  const reason = String(formData.get("reason") || "").trim() || "גריעת מלאי";
  const serialUnitId = String(formData.get("serialUnitId") || "");

  const item = await prisma.itemType.findUnique({ where: { id: itemTypeId } });
  if (!item) return;
  const warehouseId = await warehouseForItem(bId, itemTypeId, user.holderId);
  if (!warehouseId) return;

  await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: { battalionId: bId, type: "WRITE_OFF", status: "COMPLETED", fromHolderId: warehouseId, reason, createdById: user.id, approvedById: user.id, approvedAt: new Date() },
    });
    if (item.trackingMethod === "QUANTITY") {
      const qty = Math.max(1, parseInt(String(formData.get("quantity") || "0"), 10) || 0);
      await adjustQuantity(tx, bId, itemTypeId, warehouseId, statusId, -qty);
      await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId, quantity: qty, statusId } });
    } else if (serialUnitId) {
      await tx.serialUnit.delete({ where: { id: serialUnitId } });
      await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId, quantity: 1, statusId } });
    }
  });

  await audit(user.id, "WRITE_OFF", "ItemType", itemTypeId, { reason });
  revalidatePath("/inventory");
}
