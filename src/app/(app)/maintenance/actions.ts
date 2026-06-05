"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { findTanaHolder, findDefectiveStatusId, findOkStatusId } from "@/lib/tana";
import { adjustQuantity } from "@/lib/inventory";

/**
 * שליחת פריט סריאלי לטנא (סימון כתקול + העברה).
 * formData: serialUnitId, reason (טקסט חופשי)
 */
export async function sendSerialToTana(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const bId = user.battalionId!;
    const serialUnitId = String(formData.get("serialUnitId") || "");
    const reason = String(formData.get("reason") || "").trim();
    if (!serialUnitId) return { error: "חסר פריט" };
    if (!reason) return { error: "חסר תיאור התקלה" };

    const tana = await findTanaHolder(bId);
    if (!tana) return { error: 'לא נמצאה "פלוגת טנא" בגדוד (צריך פלוגה ששמה מכיל "טנא")' };

    const su = await prisma.serialUnit.findUnique({ where: { id: serialUnitId } });
    if (!su || su.battalionId !== bId) return { error: "פריט לא נמצא" };
    if (su.currentHolderId === tana.id) return { error: "פריט כבר אצל הטנא" };

    const defectiveStatusId = await findDefectiveStatusId(bId);
    if (!defectiveStatusId) return { error: "לא נמצא סטטוס 'תקול' בגדוד" };

    const fromHolderId = su.currentHolderId;
    await prisma.$transaction(async (tx) => {
      await tx.serialUnit.update({
        where: { id: serialUnitId },
        data: { currentHolderId: tana.id, statusId: defectiveStatusId, signedSoldierId: null, physicalLocation: null, locationId: null },
      });
      await tx.transfer.create({
        data: {
          battalionId: bId, type: "ISSUE", status: "COMPLETED",
          fromHolderId, toHolderId: tana.id,
          reason: `שליחה לטנא — תקלה: ${reason}`,
          createdById: user.id, approvedById: user.id, approvedAt: new Date(),
          lines: { create: { itemTypeId: su.itemTypeId, quantity: su.lotQuantity ?? 1, serialUnitId, statusId: defectiveStatusId } },
        },
      });
    });
    await audit(user.id, "SEND_TO_TANA", "SerialUnit", serialUnitId, { reason, fromHolderId });
    revalidatePath("/maintenance");
    revalidatePath("/stock");
    revalidatePath("/my-inventory");
    revalidatePath("/signatures");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message.replace(/^Error:\s*/, "") : "שגיאה" };
  }
}

/**
 * שליחת פריט כמותי לטנא (גריעה ממיקום נוכחי + הוספה לטנא בסטטוס תקול).
 * formData: itemTypeId, quantity, statusId (הסטטוס הנוכחי), fromHolderId, reason
 */
export async function sendQtyToTana(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const bId = user.battalionId!;
    const itemTypeId = String(formData.get("itemTypeId") || "");
    const fromHolderId = String(formData.get("fromHolderId") || "");
    const statusId = String(formData.get("statusId") || "");
    const quantity = Math.max(1, parseInt(String(formData.get("quantity") || "0"), 10) || 0);
    const reason = String(formData.get("reason") || "").trim();
    if (!itemTypeId || !fromHolderId || !statusId || quantity < 1) return { error: "חסרים פרטים" };
    if (!reason) return { error: "חסר תיאור התקלה" };

    const tana = await findTanaHolder(bId);
    if (!tana) return { error: 'לא נמצאה "פלוגת טנא" בגדוד' };
    if (fromHolderId === tana.id) return { error: "כבר אצל הטנא" };
    const defectiveStatusId = await findDefectiveStatusId(bId);
    if (!defectiveStatusId) return { error: "לא נמצא סטטוס 'תקול'" };

    await prisma.$transaction(async (tx) => {
      await adjustQuantity(tx, bId, itemTypeId, fromHolderId, statusId, -quantity);
      await adjustQuantity(tx, bId, itemTypeId, tana.id, defectiveStatusId, quantity);
      await tx.transfer.create({
        data: {
          battalionId: bId, type: "ISSUE", status: "COMPLETED",
          fromHolderId, toHolderId: tana.id,
          reason: `שליחה לטנא — תקלה: ${reason}`,
          createdById: user.id, approvedById: user.id, approvedAt: new Date(),
          lines: { create: { itemTypeId, quantity, statusId: defectiveStatusId } },
        },
      });
    });
    await audit(user.id, "SEND_QTY_TO_TANA", "ItemType", itemTypeId, { reason, fromHolderId, quantity });
    revalidatePath("/maintenance");
    revalidatePath("/stock");
    revalidatePath("/my-inventory");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message.replace(/^Error:\s*/, "") : "שגיאה" };
  }
}

/**
 * החזרה מהטנא לאחר תיקון.
 * formData: items=JSON [{serialUnitId|null, itemTypeId, quantity}], toHolderId, asOk (true=סטטוס תקין; false=נשאר תקול)
 */
export async function returnFromTana(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const bId = user.battalionId!;
    const toHolderId = String(formData.get("toHolderId") || "");
    const asOk = String(formData.get("asOk") || "true") === "true";
    const serialIds = formData.getAll("serial").map(String).filter(Boolean);
    const qtyEntries: { itemTypeId: string; statusId: string; qty: number }[] = [];
    for (const [key, val] of formData.entries()) {
      if (key.startsWith("qty:")) {
        const [, itemTypeId, statusId] = key.split(":");
        const qty = parseInt(String(val), 10);
        if (qty > 0 && itemTypeId && statusId) qtyEntries.push({ itemTypeId, statusId, qty });
      }
    }
    if (!toHolderId) return { error: "בחר יעד" };
    if (serialIds.length === 0 && qtyEntries.length === 0) return { error: "בחר לפחות פריט אחד" };

    const tana = await findTanaHolder(bId);
    if (!tana) return { error: 'לא נמצאה "פלוגת טנא"' };
    const okStatusId = asOk ? await findOkStatusId(bId) : null;

    let transferId = "";
    await prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.create({
        data: {
          battalionId: bId, type: "RETURN", status: "COMPLETED",
          fromHolderId: tana.id, toHolderId,
          reason: asOk ? "החזרה מהטנא — תקין" : "העברה מהטנא — עדיין תקול",
          createdById: user.id, approvedById: user.id, approvedAt: new Date(),
        },
      });
      transferId = transfer.id;
      // סריאליים
      for (const sid of serialIds) {
        const su = await tx.serialUnit.findUnique({ where: { id: sid } });
        if (!su || su.currentHolderId !== tana.id) continue;
        const finalStatus = okStatusId ?? su.statusId;
        await tx.serialUnit.update({
          where: { id: sid },
          data: { currentHolderId: toHolderId, statusId: finalStatus },
        });
        await tx.transferLine.create({
          data: { transferId: transfer.id, itemTypeId: su.itemTypeId, quantity: su.lotQuantity ?? 1, serialUnitId: sid, statusId: finalStatus },
        });
      }
      // כמותיים
      for (const e of qtyEntries) {
        const finalStatusId = okStatusId ?? e.statusId;
        await adjustQuantity(tx, bId, e.itemTypeId, tana.id, e.statusId, -e.qty);
        await adjustQuantity(tx, bId, e.itemTypeId, toHolderId, finalStatusId, e.qty);
        await tx.transferLine.create({
          data: { transferId: transfer.id, itemTypeId: e.itemTypeId, quantity: e.qty, statusId: finalStatusId },
        });
      }
    });
    await audit(user.id, "RETURN_FROM_TANA", "Transfer", transferId, { toHolderId, asOk });
    revalidatePath("/maintenance");
    revalidatePath("/stock");
    revalidatePath("/my-inventory");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message.replace(/^Error:\s*/, "") : "שגיאה" };
  }
}
