"use server";

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { adjustQuantity } from "@/lib/inventory";
import { audit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

type Recipient = { name: string; personalId?: string; phone?: string; affiliation?: string };
type QtyLine = { itemTypeId: string; statusId: string; quantity: number };

/** מאמת שהמחסן שייך למשתמש (או שהוא אדמין). */
async function assertWarehouse(userHolderIds: string[], isAdmin: boolean, warehouseId: string): Promise<boolean> {
  if (isAdmin) return true;
  return userHolderIds.includes(warehouseId);
}

/** 🆕 החתמת חוץ — מסירת ציוד לגורם חיצוני מכל מחסן, עם תעודה. הציוד יורד מהמלאי. */
export async function createExternalSignout(payload: {
  warehouseId: string; recipient: Recipient;
  serialUnitIds: string[]; qtyItems: QtyLine[]; signature?: string;
}): Promise<{ ok: true; transferId: string } | { ok: false; error: string }> {
  const user = await requireCapability("signatures.manage");
  const bId = user.battalionId!;
  const { warehouseId, recipient, serialUnitIds, qtyItems, signature } = payload;

  if (!recipient?.name?.trim()) return { ok: false, error: "נא להזין שם מלא של הגורם החיצוני" };
  if (!warehouseId) return { ok: false, error: "בחר מחסן" };
  if (!(await assertWarehouse(user.holderIds, user.isAdmin, warehouseId))) return { ok: false, error: "אין הרשאה למחסן זה" };
  if (serialUnitIds.length === 0 && qtyItems.length === 0) return { ok: false, error: "בחר לפחות פריט אחד" };

  try {
    const transferId = await prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.create({
        data: {
          battalionId: bId, type: "EXTERNAL_OUT", status: "COMPLETED",
          fromHolderId: warehouseId, createdById: user.id, approvedById: user.id, approvedAt: new Date(),
          externalName: recipient.name.trim(),
          recipientPersonalId: recipient.personalId?.trim() || null,
          externalPhone: recipient.phone?.trim() || null,
          externalUnit: recipient.affiliation?.trim() || null,
          externalSignature: signature || null,
          notes: "החתמת חוץ",
        },
      });
      // סריאלי — יורד מהמחסן, מסומן כאצל גורם חוץ
      for (const sid of serialUnitIds) {
        const su = await tx.serialUnit.findUnique({ where: { id: sid } });
        if (!su || su.currentHolderId !== warehouseId) continue;
        await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId: su.itemTypeId, quantity: su.lotQuantity ?? 1, serialUnitId: sid, statusId: su.statusId } });
        await tx.serialUnit.update({ where: { id: sid }, data: { currentHolderId: null, signedSoldierId: null, externalHolderName: recipient.name.trim() } });
      }
      // כמותי — יורד מיתרת המחסן
      for (const q of qtyItems) {
        if (q.quantity < 1) continue;
        const bal = await tx.stockBalance.findFirst({ where: { itemTypeId: q.itemTypeId, holderId: warehouseId, statusId: q.statusId, battalionId: bId } });
        if (!bal || bal.quantity < q.quantity) throw new Error("אין מספיק מלאי במחסן לאחד הפריטים");
        await adjustQuantity(tx, bId, q.itemTypeId, warehouseId, q.statusId, -q.quantity);
        await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId: q.itemTypeId, quantity: q.quantity, statusId: q.statusId } });
      }
      return transfer.id;
    });
    await audit(user.id, "EXTERNAL_OUT", "Transfer", transferId, { recipient: recipient.name });
    revalidatePath("/signatures");
    return { ok: true, transferId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה בהחתמת חוץ" };
  }
}

/** 🆕 זיכוי חוץ — קבלת ציוד חזרה מגורם חיצוני למחסן. */
export async function externalCheckin(payload: {
  warehouseId: string; serialUnitIds: string[]; qtyItems: QtyLine[]; recipientName?: string;
}): Promise<{ ok: true; transferId: string } | { ok: false; error: string }> {
  const user = await requireCapability("signatures.manage");
  const bId = user.battalionId!;
  const { warehouseId, serialUnitIds, qtyItems, recipientName } = payload;
  if (!warehouseId) return { ok: false, error: "בחר מחסן יעד" };
  if (!(await assertWarehouse(user.holderIds, user.isAdmin, warehouseId))) return { ok: false, error: "אין הרשאה למחסן זה" };
  if (serialUnitIds.length === 0 && qtyItems.length === 0) return { ok: false, error: "בחר לפחות פריט אחד" };

  try {
    const transferId = await prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.create({
        data: {
          battalionId: bId, type: "EXTERNAL_IN", status: "COMPLETED",
          toHolderId: warehouseId, createdById: user.id, approvedById: user.id, approvedAt: new Date(),
          externalName: recipientName?.trim() || null, notes: "זיכוי חוץ",
        },
      });
      for (const sid of serialUnitIds) {
        const su = await tx.serialUnit.findUnique({ where: { id: sid } });
        if (!su || su.externalHolderName == null) continue;
        await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId: su.itemTypeId, quantity: su.lotQuantity ?? 1, serialUnitId: sid, statusId: su.statusId } });
        await tx.serialUnit.update({ where: { id: sid }, data: { currentHolderId: warehouseId, externalHolderName: null } });
      }
      for (const q of qtyItems) {
        if (q.quantity < 1) continue;
        await adjustQuantity(tx, bId, q.itemTypeId, warehouseId, q.statusId, q.quantity);
        await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId: q.itemTypeId, quantity: q.quantity, statusId: q.statusId } });
      }
      return transfer.id;
    });
    await audit(user.id, "EXTERNAL_IN", "Transfer", transferId, {});
    revalidatePath("/signatures");
    return { ok: true, transferId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה בזיכוי חוץ" };
  }
}
