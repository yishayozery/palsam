"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { adjustQuantity, defaultStatusId } from "@/lib/inventory";

/** הצהרת מלאי גדודי מול החטיבה — מפמ קובע כמה יחידות יש לו מכל פריט */
export async function declareStock(formData: FormData) {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const itemTypeId = String(formData.get("itemTypeId") || "");
  const quantity = Math.max(0, parseInt(String(formData.get("quantity") || "0"), 10) || 0);
  if (!itemTypeId) return;

  const item = await prisma.itemType.findUnique({
    where: { id: itemTypeId },
    include: { category: true },
  });
  if (!item) return;

  // איתור המחסן הנכון לפי קטגוריה→טיפוס מחסן (או הראשון בגדוד)
  const wtype = item.category?.warehouseType;
  const warehouse = wtype
    ? await prisma.holder.findFirst({ where: { battalionId: bId, kind: "WAREHOUSE", warehouseType: wtype } })
    : await prisma.holder.findFirst({ where: { battalionId: bId, kind: "WAREHOUSE" } });
  if (!warehouse) return;

  await prisma.$transaction(async (tx) => {
    const statusId = await defaultStatusId(tx, bId);

    if (item.trackingMethod === "QUANTITY") {
      // המרת היתרה הנוכחית לכמות המוצהרת (delta = target - current)
      const current = await tx.stockBalance.findFirst({
        where: { itemTypeId, holderId: warehouse.id, statusId },
      });
      const delta = quantity - (current?.quantity ?? 0);
      await adjustQuantity(tx, bId, itemTypeId, warehouse.id, statusId, delta);
    } else if (item.trackingMethod === "LOT") {
      // אצווה חדשה עם הכמות המוצהרת
      const lotNumber = String(formData.get("lotNumber") || "").trim();
      if (lotNumber && quantity > 0) {
        await tx.serialUnit.create({
          data: { battalionId: bId, itemTypeId, serialNumber: lotNumber, lotQuantity: quantity, statusId, currentHolderId: warehouse.id },
        });
      }
    } else if (item.trackingMethod === "SERIAL") {
      // כמות סריאליות לפתיחה — בשלב זה ניצור placeholders ממוספרים; המספרים יתעדכנו ידנית
      const prefix = (item.sku || "SN").toUpperCase();
      const existing = await tx.serialUnit.count({ where: { itemTypeId, currentHolderId: warehouse.id } });
      for (let i = 1; i <= quantity; i++) {
        const sn = `${prefix}-${String(existing + i).padStart(4, "0")}`;
        try {
          await tx.serialUnit.create({
            data: { battalionId: bId, itemTypeId, serialNumber: sn, statusId, currentHolderId: warehouse.id },
          });
        } catch {/* כפילות — דלג */}
      }
    }

    await tx.transfer.create({
      data: {
        battalionId: bId, type: "INTAKE", status: "COMPLETED",
        toHolderId: warehouse.id, reason: "הצהרת מלאי גדודי מול החטיבה",
        createdById: user.id, approvedById: user.id, approvedAt: new Date(),
        lines: { create: { itemTypeId, quantity, statusId } },
      },
    });
  });

  await audit(user.id, "DECLARE_STOCK", "ItemType", itemTypeId, { quantity });
  revalidatePath("/items");
}
