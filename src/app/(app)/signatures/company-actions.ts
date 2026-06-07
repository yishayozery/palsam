"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { adjustQuantity, defaultStatusId } from "@/lib/inventory";
import type { SignatureMethod } from "@/generated/prisma";

/**
 * החתמת פלוגה: ניפוק לפלוגה כשהנמען הוא משתמש בפלוגה (מפ/רס"פ),
 * הוא חותם דיגיטלית, והפריטים עוברים לפלוגה אוטומטית עם החתימה.
 * מחזיר את ה-token לניווט בקליינט (במקום redirect שלא חוצה async wrappers טוב).
 */
export async function createCompanySign(formData: FormData): Promise<{ token: string }> {
  const user = await requireUser();
  if (!can(user.role, "signatures.manage")) throw new Error("אין הרשאה");
  const bId = user.battalionId!;

  const companyId = String(formData.get("companyId") || "");
  const recipientUserId = String(formData.get("recipientUserId") || "");
  const method = String(formData.get("method") || "QR") as SignatureMethod;
  const serialIds = formData.getAll("serial").map(String).filter(Boolean);
  const qtyEntries: { itemTypeId: string; statusId: string; qty: number }[] = [];
  for (const [key, val] of formData.entries()) {
    if (key.startsWith("qty:")) {
      const [, itemTypeId, statusId] = key.split(":");
      const qty = parseInt(String(val), 10);
      if (qty > 0 && itemTypeId && statusId) qtyEntries.push({ itemTypeId, statusId, qty });
    }
  }

  if (!companyId) throw new Error("חסרה פלוגה");
  if (!recipientUserId) throw new Error("חסר נמען חותם");
  if (serialIds.length === 0 && qtyEntries.length === 0) throw new Error("חסרים פריטים");

  // מציאת מחסן המקור: למפ"מ — לפי המחסן של הפריט (קטגוריה→warehouseType)
  // לקצין מחסן — המחסן שלו
  const findSourceHolder = async (itemTypeId: string): Promise<string | null> => {
    if (user.holderId) return user.holderId;
    const item = await prisma.itemType.findUnique({
      where: { id: itemTypeId }, include: { category: true },
    });
    const wType = item?.category?.warehouseType;
    if (!wType) return null;
    const wh = await prisma.holder.findFirst({
      where: { battalionId: bId, kind: "WAREHOUSE", warehouseType: wType, active: true },
    });
    return wh?.id ?? null;
  };

  const token = nanoid(24);
  let transferId = "";
  try {
    await prisma.$transaction(async (tx) => {
      // בחירת holder יחיד למפ"מ (לפי הפריט הראשון; כל הפריטים אמורים להיות מאותו מחסן)
      const sampleItemId = qtyEntries[0]?.itemTypeId ??
        (serialIds[0] ? (await tx.serialUnit.findUnique({ where: { id: serialIds[0] } }))?.itemTypeId : null);
      const fromHolderId = sampleItemId ? await findSourceHolder(sampleItemId) : null;

      const transfer = await tx.transfer.create({
        data: {
          battalionId: bId, type: "ISSUE", status: "PENDING",
          fromHolderId, toHolderId: companyId, toUserId: recipientUserId,
          notes: "החתמת פלוגה דרך נמען", createdById: user.id,
        },
      });
      transferId = transfer.id;

      for (const e of qtyEntries) {
        const itemHolder = await findSourceHolder(e.itemTypeId);
        if (itemHolder) {
          await adjustQuantity(tx, bId, e.itemTypeId, itemHolder, e.statusId, -e.qty);
        }
        await tx.transferLine.create({
          data: { transferId: transfer.id, itemTypeId: e.itemTypeId, quantity: e.qty, statusId: e.statusId },
        });
      }
      for (const sid of serialIds) {
        const su = await tx.serialUnit.findUnique({ where: { id: sid } });
        if (!su) continue;
        // אצווה? אפשר להחתים על כמות חלקית — נשמר ב-line.quantity, השרת יפצל בעת ההשלמה
        const partialLotQty = parseInt(String(formData.get(`lotQty:${sid}`) || "0"), 10);
        const lineQty = partialLotQty > 0 && partialLotQty < (su.lotQuantity ?? 1) ? partialLotQty : (su.lotQuantity ?? 1);
        // הסרת המיקום הנוכחי (במעבר) — רק אם זו אצווה שלמה. בפיצול יש להשאיר את המקור
        if (lineQty === (su.lotQuantity ?? 1)) {
          await tx.serialUnit.update({ where: { id: sid }, data: { currentHolderId: null } });
        }
        await tx.transferLine.create({
          data: { transferId: transfer.id, itemTypeId: su.itemTypeId, quantity: lineQty, serialUnitId: sid, statusId: su.statusId },
        });
      }
      await tx.signature.create({
        data: {
          battalionId: bId, signerUserId: recipientUserId, transferId: transfer.id,
          method, status: "PENDING", token,
          tokenExpires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        },
      });
    });
  } catch (e) {
    throw new Error(`שגיאה ביצירת ההחתמה: ${e instanceof Error ? e.message : "שגיאה לא ידועה"}`);
  }

  await audit(user.id, "COMPANY_SIGN_OUT", "Transfer", transferId, { companyId, recipientUserId });
  revalidatePath("/signatures");
  return { token };
}

/** השלמת חתימה של נמען (מפ/רס"פ) → הפריטים עוברים לפלוגה */
export async function completeCompanySignature(token: string, signatureData: string) {
  const sig = await prisma.signature.findUnique({
    where: { token },
    include: { transfer: { include: { lines: true } } },
  });
  if (!sig || sig.status !== "PENDING" || !sig.transfer) return { ok: false, error: "החתימה אינה זמינה או כבר בוצעה" };
  if (sig.tokenExpires && sig.tokenExpires < new Date()) {
    await prisma.signature.update({ where: { token }, data: { status: "EXPIRED" } });
    return { ok: false, error: "פג תוקף הקישור" };
  }

  await prisma.$transaction(async (tx) => {
    const t = sig.transfer!;
    const targetHolderId = t.toHolderId!;
    for (const line of t.lines) {
      if (line.serialUnitId) {
        const unit = await tx.serialUnit.findUnique({ where: { id: line.serialUnitId } });
        if (!unit) continue;
        const isLot = (unit.lotQuantity ?? 1) > 1;
        const lineQty = line.quantity ?? 1;
        if (isLot && lineQty < (unit.lotQuantity ?? 1)) {
          // פיצול אצווה: יוצרים יחידה חדשה לפלוגה, מקטינים את המקור
          let suffix = 1;
          while (await tx.serialUnit.findFirst({ where: { itemTypeId: unit.itemTypeId, serialNumber: `${unit.serialNumber}/${suffix}` } })) {
            suffix++;
          }
          await tx.serialUnit.create({
            data: {
              battalionId: unit.battalionId, itemTypeId: unit.itemTypeId,
              serialNumber: `${unit.serialNumber}/${suffix}`, lotQuantity: lineQty,
              statusId: unit.statusId, currentHolderId: targetHolderId,
            },
          });
          await tx.serialUnit.update({
            where: { id: unit.id },
            data: { lotQuantity: (unit.lotQuantity ?? 1) - lineQty },
          });
        } else {
          await tx.serialUnit.update({ where: { id: line.serialUnitId }, data: { currentHolderId: targetHolderId } });
        }
      } else if (line.statusId) {
        const bId = t.battalionId!;
        const sId = line.statusId ?? await defaultStatusId(tx, bId);
        await adjustQuantity(tx, bId, line.itemTypeId, targetHolderId, sId, line.quantity);
      }
    }
    await tx.signature.update({ where: { token }, data: { status: "SIGNED", signatureData, signedAt: new Date() } });
    await tx.transfer.update({ where: { id: t.id }, data: { status: "COMPLETED", approvedAt: new Date() } });
  });

  await audit(null, "COMPANY_SIGN", "Signature", sig.id);
  revalidatePath("/signatures");
  return { ok: true };
}

/**
 * זיכוי פלוגה — החזרת ציוד מפלוגה למחסן הגדודי המתאים (סריאלי וכמותי).
 * formData:
 *   - companyId: holderId של הפלוגה
 *   - serial[]: ids של SerialUnit להחזיר
 *   - qty:itemTypeId:statusId = כמות להחזיר (אפשר רבים)
 *   - newStatusId (אופציונלי): סטטוס חדש לכל הפריטים (תקול/אובדן וכו')
 */
export async function companyReturn(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    if (!can(user.role, "signatures.manage")) return { error: "אין הרשאה" };
    const bId = user.battalionId!;
    const companyId = String(formData.get("companyId") || "");
    const newStatusId = String(formData.get("newStatusId") || "") || null;
    const serialIds = formData.getAll("serial").map(String).filter(Boolean);
    const qtyEntries: { itemTypeId: string; statusId: string; qty: number }[] = [];
    for (const [key, val] of formData.entries()) {
      if (key.startsWith("qty:")) {
        const [, itemTypeId, statusId] = key.split(":");
        const qty = parseInt(String(val), 10);
        if (qty > 0 && itemTypeId && statusId) qtyEntries.push({ itemTypeId, statusId, qty });
      }
    }
    if (!companyId) return { error: "חסרה פלוגה" };
    if (serialIds.length === 0 && qtyEntries.length === 0) return { error: "בחר לפחות פריט אחד" };

    // איתור מחסן יעד לפי קטגוריית הפריט
    const findDestWarehouse = async (itemTypeId: string): Promise<string | null> => {
      const item = await prisma.itemType.findUnique({ where: { id: itemTypeId }, include: { category: true } });
      const wType = item?.category?.warehouseType;
      if (wType) {
        const wh = await prisma.holder.findFirst({ where: { battalionId: bId, kind: "WAREHOUSE", warehouseType: wType, active: true } });
        if (wh) return wh.id;
      }
      // fallback — מחסן ראשון
      const any = await prisma.holder.findFirst({ where: { battalionId: bId, kind: "WAREHOUSE", active: true } });
      return any?.id ?? null;
    };

    let transferId = "";
    await prisma.$transaction(async (tx) => {
      const sampleItemId = qtyEntries[0]?.itemTypeId ??
        (serialIds[0] ? (await tx.serialUnit.findUnique({ where: { id: serialIds[0] } }))?.itemTypeId : null);
      const toHolderId = sampleItemId ? await findDestWarehouse(sampleItemId) : null;

      const transfer = await tx.transfer.create({
        data: {
          battalionId: bId, type: "RETURN", status: "COMPLETED",
          fromHolderId: companyId, toHolderId,
          reason: "זיכוי פלוגה", createdById: user.id, approvedById: user.id, approvedAt: new Date(),
        },
      });
      transferId = transfer.id;

      // סריאליים: סטטוס פר-שורה > כללי > מקור; אצוות חלקיות מתפצלות.
      for (const sid of serialIds) {
        const su = await tx.serialUnit.findUnique({ where: { id: sid } });
        if (!su || su.currentHolderId !== companyId) continue;
        const destId = await findDestWarehouse(su.itemTypeId);
        const lineOverride = String(formData.get(`serialStatus:${sid}`) || "") || null;
        const finalStatus = lineOverride || newStatusId || su.statusId;
        const partialLotQty = parseInt(String(formData.get(`lotQty:${sid}`) || "0"), 10);
        const isLot = (su.lotQuantity ?? 1) > 1;
        const isPartial = isLot && partialLotQty > 0 && partialLotQty < (su.lotQuantity ?? 1);

        if (isPartial) {
          let suffix = 1;
          while (await tx.serialUnit.findFirst({ where: { itemTypeId: su.itemTypeId, serialNumber: `${su.serialNumber}/${suffix}` } })) {
            suffix++;
          }
          await tx.serialUnit.create({
            data: {
              battalionId: bId, itemTypeId: su.itemTypeId,
              serialNumber: `${su.serialNumber}/${suffix}`,
              lotQuantity: partialLotQty,
              statusId: finalStatus, currentHolderId: destId,
            },
          });
          await tx.serialUnit.update({
            where: { id: su.id },
            data: { lotQuantity: (su.lotQuantity ?? 1) - partialLotQty },
          });
          await tx.transferLine.create({
            data: { transferId: transfer.id, itemTypeId: su.itemTypeId, quantity: partialLotQty, serialUnitId: sid, statusId: finalStatus },
          });
        } else {
          await tx.serialUnit.update({
            where: { id: sid },
            data: { currentHolderId: destId, statusId: finalStatus, signedSoldierId: null, physicalLocation: null, locationId: null },
          });
          await tx.transferLine.create({
            data: { transferId: transfer.id, itemTypeId: su.itemTypeId, quantity: su.lotQuantity ?? 1, serialUnitId: sid, statusId: finalStatus },
          });
        }
      }

      // כמותיים: גריעה מהפלוגה + תוספת במחסן (סטטוס פר-שורה גובר)
      for (const e of qtyEntries) {
        const destId = await findDestWarehouse(e.itemTypeId);
        if (!destId) continue;
        const lineOverride = String(formData.get(`qtyStatus:${e.itemTypeId}:${e.statusId}`) || "") || null;
        const finalStatusId = lineOverride || newStatusId || e.statusId;
        await adjustQuantity(tx, bId, e.itemTypeId, companyId, e.statusId, -e.qty);
        await adjustQuantity(tx, bId, e.itemTypeId, destId, finalStatusId, e.qty);
        await tx.transferLine.create({
          data: { transferId: transfer.id, itemTypeId: e.itemTypeId, quantity: e.qty, statusId: finalStatusId },
        });
      }
    });

    await audit(user.id, "COMPANY_RETURN", "Transfer", transferId, { companyId, serials: serialIds.length, qtyLines: qtyEntries.length });
    revalidatePath("/signatures");
    revalidatePath("/stock");
    revalidatePath("/my-inventory");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message.replace(/^Error:\s*/, "") : "שגיאה לא ידועה" };
  }
}
