"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

/** רס"פ פלוגה יוצר בקשת זיכוי (RETURN) למחסן הגדודי המתאים. אישור — דרך handshake. */
export async function createReturn(formData: FormData) {
  const user = await requireCapability("company.manage");
  const bId = user.battalionId!;
  const companyId = user.holderId;
  if (!companyId) throw new Error("המשתמש לא משויך לפלוגה");

  const itemTypeId = String(formData.get("itemTypeId") || "");
  const quantity = Math.max(1, parseInt(String(formData.get("quantity") || "0"), 10) || 0);
  const statusId = String(formData.get("statusId") || "");
  const serialIds = formData.getAll("serialId").map(String).filter(Boolean);
  const notes = String(formData.get("notes") || "").trim() || null;
  if (!itemTypeId) throw new Error("חובה לבחור פריט");

  // מציאת מחסן יעד לפי קטגוריית הפריט
  const item = await prisma.itemType.findUnique({ where: { id: itemTypeId }, include: { category: true } });
  if (!item) throw new Error("פריט לא נמצא");
  const wtype = item.category?.warehouseType;
  const toHolder = wtype
    ? await prisma.holder.findFirst({ where: { battalionId: bId, kind: "WAREHOUSE", warehouseType: wtype, active: true } })
    : await prisma.holder.findFirst({ where: { battalionId: bId, kind: "WAREHOUSE", active: true }, orderBy: { createdAt: "asc" } });
  if (!toHolder) throw new Error("לא נמצא מחסן יעד תואם");

  // יצירת ההעברה כ-PENDING (ממתינה לאישור קצין המחסן)
  await prisma.$transaction(async (tx) => {
    const t = await tx.transfer.create({
      data: {
        battalionId: bId,
        type: "RETURN",
        status: "PENDING",
        fromHolderId: companyId,
        toHolderId: toHolder.id,
        reason: "זיכוי מהפלוגה",
        notes,
        createdById: user.id,
      },
    });
    if (serialIds.length > 0) {
      for (const sid of serialIds) {
        const su = await tx.serialUnit.findUnique({ where: { id: sid } });
        if (!su || su.currentHolderId !== companyId) continue;
        await tx.transferLine.create({
          data: { transferId: t.id, itemTypeId: su.itemTypeId, quantity: su.lotQuantity ?? 1, serialUnitId: sid, statusId: su.statusId },
        });
      }
    } else if (quantity > 0 && statusId) {
      await tx.transferLine.create({ data: { transferId: t.id, itemTypeId, quantity, statusId } });
    }
  });

  await audit(user.id, "CREATE_RETURN", "Transfer", itemTypeId, { quantity, serials: serialIds.length });
  revalidatePath("/return");
  revalidatePath("/dashboard");
}
