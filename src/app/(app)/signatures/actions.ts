"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { requiresPersonalId } from "@/lib/handover";
import { getSoldierEquipmentSummary, formatSoldierSummaryForWhatsApp, type SoldierEquipmentSummary } from "@/lib/soldier-summary";
import type { SignatureMethod } from "@/generated/prisma";

/** מחזיר את ה-summary של חייל אחרי חתימה - לשליחה ב-WhatsApp. ציבורי דרך token. */
export async function getPostSignatureShareData(
  token: string,
): Promise<{ ok: true; summary: SoldierEquipmentSummary; whatsappText: string } | { ok: false; error: string }> {
  try {
    const sig = await prisma.signature.findUnique({
      where: { token },
      select: { soldierId: true, status: true },
    });
    if (!sig) return { ok: false, error: "החתימה לא נמצאה" };
    if (!sig.soldierId) return { ok: false, error: "סוג חתימה לא נתמך לסיכום" };
    if (sig.status !== "SIGNED") return { ok: false, error: "החתימה עדיין לא בוצעה" };
    const summary = await getSoldierEquipmentSummary(sig.soldierId);
    if (!summary) return { ok: false, error: "חייל לא נמצא" };
    const whatsappText = formatSoldierSummaryForWhatsApp(summary, {
      headerTitle: "📋 סיכום ציוד חתום על החייל (לאחר חתימה)",
    });
    return { ok: true, summary, whatsappText };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** יצירת החתמה (SIGNOUT): מחזיק ◄ חייל. */
export async function createSignout(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "signatures.manage")) redirect("/signatures");
  const bId = user.battalionId!;
  const soldierId = String(formData.get("soldierId") || "");
  const method = String(formData.get("method") || "QR") as SignatureMethod;
  const serialIds = formData.getAll("serial").map(String).filter(Boolean);
  const vehicleId = String(formData.get("vehicleId") || "") || null;
  const kitId = String(formData.get("kitId") || "") || null;
  const physicalLocation = String(formData.get("physicalLocation") || "").trim() || null;
  const equipmentLocationId = String(formData.get("equipmentLocationId") || "") || null;
  // פריטים כמותיים בעגלה (מקבילות: qtyItem[], qtyValue[], qtyStatus[])
  const qtyItems = formData.getAll("qtyItem").map(String);
  const qtyValues = formData.getAll("qtyValue").map((v) => parseInt(String(v), 10) || 0);
  const qtyStatuses = formData.getAll("qtyStatus").map(String);
  const hasAnything = serialIds.length > 0 || kitId || qtyItems.length > 0;
  if (!soldierId || !hasAnything) throw new Error("בחר חייל ולפחות פריט אחד");

  // 🔒 אכיפת מ.א. — אם הגדוד דורש, חייב להיות לחייל מ.א. במערכת
  if (await requiresPersonalId(bId)) {
    const soldier = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { fullName: true, personalNumber: true } });
    if (!soldier?.personalNumber) {
      throw new Error(`🔒 הגדוד דורש מ.א. בכל מסירה. החייל ${soldier?.fullName ?? ""} לא מקושר למ.א. — עדכן ב-/roster לפני ההחתמה.`);
    }
  }

  // אם נבחרה ערכה — נוסיף את הפריטים הכמותיים שלה כשורות העברה
  const kitLines = kitId
    ? await prisma.signableKitLine.findMany({ where: { kitId }, include: { itemType: true } })
    : [];

  // 🛡️ ולידציה: לא ניתן להחתים יותר ממה שיש במלאי (פריטים כמותיים שהמשתמש בחר ידנית)
  if (user.holderId && qtyItems.length > 0) {
    for (let i = 0; i < qtyItems.length; i++) {
      const itemTypeId = qtyItems[i];
      const quantity = qtyValues[i];
      const statusId = qtyStatuses[i];
      if (!itemTypeId || !statusId || quantity < 1) continue;
      const balance = await prisma.stockBalance.findFirst({
        where: { itemTypeId, holderId: user.holderId, statusId, battalionId: bId },
      });
      const available = balance?.quantity ?? 0;
      if (available < quantity) {
        const item = await prisma.itemType.findUnique({ where: { id: itemTypeId }, select: { name: true } });
        throw new Error(`🚫 לא מספיק מלאי של "${item?.name ?? itemTypeId}": מבקש ${quantity}, זמין ${available}`);
      }
    }
  }

  const token = nanoid(24);
  let transferId = "";
  await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: { battalionId: bId, type: "SIGNOUT", status: "PENDING", toSoldierId: soldierId, fromHolderId: user.holderId, createdById: user.id, notes: kitId ? "החתמה על ערכה" : null },
    });
    transferId = transfer.id;
    // יחידות סריאליות שנבחרו ידנית
    for (const sid of serialIds) {
      const su = await tx.serialUnit.findUnique({ where: { id: sid } });
      if (!su) continue;
      // אם זו אצווה והגיע lotQty — שולח כמות חלקית
      const partialLotQty = parseInt(String(formData.get(`lotQty:${sid}`) || "0"), 10);
      const lineQty = partialLotQty > 0 && partialLotQty < (su.lotQuantity ?? 1) ? partialLotQty : (su.lotQuantity ?? 1);
      await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId: su.itemTypeId, quantity: lineQty, serialUnitId: sid, statusId: su.statusId } });
      // עדכון מיקום פיזי + רכב + מיקום ציוד (חדש)
      const updateData: { vehicleId?: string; physicalLocation?: string; equipmentLocationId?: string } = {};
      if (vehicleId) updateData.vehicleId = vehicleId;
      if (physicalLocation) updateData.physicalLocation = physicalLocation;
      if (equipmentLocationId) updateData.equipmentLocationId = equipmentLocationId;
      if (Object.keys(updateData).length > 0) {
        await tx.serialUnit.update({ where: { id: sid }, data: updateData });
      }
    }
    // פריטים מהערכה — תמיכה בכמותי וסריאלי
    for (const l of kitLines) {
      if (l.itemType.trackingMethod === "QUANTITY" || l.itemType.trackingMethod === "LOT") {
        const status = await tx.itemStatus.findFirst({ where: { battalionId: bId, isDefault: true } });
        await tx.transferLine.create({
          data: { transferId: transfer.id, itemTypeId: l.itemTypeId, quantity: l.quantity, statusId: status?.id },
        });
      } else if (l.itemType.trackingMethod === "SERIAL") {
        // משיכת SN פנוי (לא חתום) מהמחסן של המשתמש
        const available = await tx.serialUnit.findMany({
          where: {
            battalionId: bId, itemTypeId: l.itemTypeId, signedSoldierId: null,
            ...(user.holderId ? { currentHolderId: user.holderId } : {}),
          },
          take: l.quantity,
        });
        if (available.length < l.quantity) {
          throw new Error(`אין מספיק יחידות סריאליות פנויות של ${l.itemType.name} (נדרש: ${l.quantity}, זמין: ${available.length})`);
        }
        for (const su of available) {
          await tx.transferLine.create({
            data: { transferId: transfer.id, itemTypeId: l.itemTypeId, quantity: 1, serialUnitId: su.id, statusId: su.statusId },
          });
          if (vehicleId) {
            await tx.serialUnit.update({ where: { id: su.id }, data: { vehicleId } });
          }
        }
      }
    }
    // פריטים כמותיים שנבחרו ידנית בעגלה
    for (let i = 0; i < qtyItems.length; i++) {
      const itemTypeId = qtyItems[i];
      const quantity = qtyValues[i];
      const statusId = qtyStatuses[i] || null;
      if (!itemTypeId || quantity < 1) continue;
      await tx.transferLine.create({
        data: { transferId: transfer.id, itemTypeId, quantity, statusId },
      });
    }
    await tx.signature.create({
      data: { battalionId: bId, soldierId, transferId: transfer.id, method, status: "PENDING", token, tokenExpires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) },
    });
  });

  await audit(user.id, "CREATE_SIGNOUT", "Transfer", transferId, { soldierId, method });
  revalidatePath("/signatures");
  // ⚠️ שרבוט → ישר למסך החתימה; QR/WhatsApp → מסך השיתוף עם QR
  if (method === "ONSITE") redirect(`/sign/${token}`);
  redirect(`/signatures/${token}`);
}

/** השלמת חתימה (ציבורי) */
export async function completeSignature(token: string, signatureData: string) {
  const sig = await prisma.signature.findUnique({ where: { token }, include: { transfer: { include: { lines: true } } } });
  if (!sig || sig.status !== "PENDING" || !sig.transfer) return { ok: false, error: "החתימה אינה זמינה או כבר בוצעה" };
  if (sig.tokenExpires && sig.tokenExpires < new Date()) {
    await prisma.signature.update({ where: { token }, data: { status: "EXPIRED" } });
    return { ok: false, error: "פג תוקף הקישור" };
  }

  if (!sig.soldierId) return { ok: false, error: "סוג חתימה לא תואם" };
  const soldierId = sig.soldierId;
  const fromHolderId = sig.transfer!.fromHolderId;
  await prisma.$transaction(async (tx) => {
    for (const line of sig.transfer!.lines) {
      if (line.serialUnitId) {
        // יחידה סריאלית / אצווה — אם line.quantity קטן מ-lotQuantity, מפצלים
        const unit = await tx.serialUnit.findUnique({ where: { id: line.serialUnitId } });
        if (!unit) continue;
        const isLot = (unit.lotQuantity ?? 1) > 1;
        const lineQty = line.quantity ?? 1;
        if (isLot && lineQty < (unit.lotQuantity ?? 1)) {
          // פיצול אצווה: יוצרים יחידה חדשה לחייל, מקטינים את המקור
          let childSerial = unit.serialNumber;
          let suffix = 1;
          // מציאת serialNumber ייחודי
          while (await tx.serialUnit.findFirst({ where: { itemTypeId: unit.itemTypeId, serialNumber: `${childSerial}/${suffix}` } })) {
            suffix++;
          }
          const splitSerial = `${childSerial}/${suffix}`;
          await tx.serialUnit.create({
            data: {
              battalionId: unit.battalionId, itemTypeId: unit.itemTypeId,
              serialNumber: splitSerial, lotQuantity: lineQty,
              statusId: unit.statusId, signedSoldierId: soldierId,
              currentHolderId: unit.currentHolderId,
            },
          });
          await tx.serialUnit.update({
            where: { id: unit.id },
            data: { lotQuantity: (unit.lotQuantity ?? 1) - lineQty },
          });
        } else {
          // יחידה רגילה / אצווה שלמה: מעבר signedTo
          await tx.serialUnit.update({ where: { id: line.serialUnitId }, data: { signedSoldierId: soldierId } });
        }
      } else if (line.statusId && fromHolderId) {
        // יחידה כמותית: גריעה מסך המלאי במחסן המקור
        const existing = await tx.stockBalance.findFirst({ where: { itemTypeId: line.itemTypeId, holderId: fromHolderId, statusId: line.statusId } });
        if (existing) {
          await tx.stockBalance.update({ where: { id: existing.id }, data: { quantity: Math.max(0, existing.quantity - line.quantity) } });
        }
      }
    }
    await tx.signature.update({ where: { token }, data: { status: "SIGNED", signatureData, signedAt: new Date() } });
    await tx.transfer.update({ where: { id: sig.transferId! }, data: { status: "COMPLETED", approvedAt: new Date() } });
  });

  await audit(null, "SIGN", "Signature", sig.id, { soldierId });
  revalidatePath("/signatures");
  return { ok: true };
}

/** זיכוי מהיר (Fast Check-in) */
export async function checkinSerial(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "signatures.manage")) redirect("/signatures");
  const bId = user.battalionId!;
  const serialUnitId = String(formData.get("serialUnitId") || "");
  const statusId = String(formData.get("statusId") || "");
  const partialLotQty = parseInt(String(formData.get("lotQty") || "0"), 10);

  const su = await prisma.serialUnit.findUnique({ where: { id: serialUnitId }, include: { signedSoldier: true } });
  if (!su || !su.signedSoldierId) return;

  // 🔒 אכיפת מ.א. — אם הגדוד דורש, חייב להיות לחייל מ.א.
  if (await requiresPersonalId(bId)) {
    if (!su.signedSoldier?.personalNumber) {
      throw new Error(`🔒 הגדוד דורש מ.א. בכל מסירה. החייל ${su.signedSoldier?.fullName ?? ""} לא מקושר למ.א.`);
    }
  }

  const isLot = (su.lotQuantity ?? 1) > 1;
  const isPartial = isLot && partialLotQty > 0 && partialLotQty < (su.lotQuantity ?? 1);
  const lineQty = isPartial ? partialLotQty : (su.lotQuantity ?? 1);

  await prisma.$transaction(async (tx) => {
    if (isPartial) {
      const finalStatus = statusId || su.statusId;
      // 🆕 ניסיון מיזוג: חפש אצווה-הורה במחסן עם אותו סטטוס וSN-מקור — וצרף אליה.
      // SN-מקור = ה-serialNumber לפני סופיקס `/N` (למשל 1234585/1 → המקור 1234585).
      const parentSerial = (() => {
        const lastSlash = su.serialNumber.lastIndexOf("/");
        if (lastSlash < 0) return su.serialNumber;
        const suffix = su.serialNumber.slice(lastSlash + 1);
        return /^\d+$/.test(suffix) ? su.serialNumber.slice(0, lastSlash) : su.serialNumber;
      })();
      const mergeTarget = await tx.serialUnit.findFirst({
        where: {
          itemTypeId: su.itemTypeId,
          currentHolderId: su.currentHolderId,
          signedSoldierId: null,
          statusId: finalStatus,
          serialNumber: { in: [parentSerial, su.serialNumber] },
          id: { not: su.id },
          lotQuantity: { gt: 1 }, // אצווה בלבד
        },
      });

      if (mergeTarget) {
        // 🟢 מיזוג: מוסיפים ל-target ומקטינים את המקור — בלי יצירת ילד
        await tx.serialUnit.update({
          where: { id: mergeTarget.id },
          data: { lotQuantity: (mergeTarget.lotQuantity ?? 1) + partialLotQty },
        });
      } else {
        // אין אצווה-הורה במחסן — יוצרים יחידה חדשה (התנהגות מקורית)
        let suffix = 1;
        while (await tx.serialUnit.findFirst({ where: { itemTypeId: su.itemTypeId, serialNumber: `${su.serialNumber}/${suffix}` } })) {
          suffix++;
        }
        await tx.serialUnit.create({
          data: {
            battalionId: bId, itemTypeId: su.itemTypeId,
            serialNumber: `${su.serialNumber}/${suffix}`,
            lotQuantity: partialLotQty,
            statusId: finalStatus,
            currentHolderId: su.currentHolderId,
          },
        });
      }
      await tx.serialUnit.update({
        where: { id: su.id },
        data: { lotQuantity: (su.lotQuantity ?? 1) - partialLotQty },
      });
    } else {
      // זיכוי שלם — היחידה חוזרת למחסן
      await tx.serialUnit.update({ where: { id: serialUnitId }, data: { signedSoldierId: null, ...(statusId ? { statusId } : {}) } });
    }
    await tx.transfer.create({
      data: {
        battalionId: bId, type: "CHECKIN", status: "COMPLETED", toHolderId: su.currentHolderId, createdById: user.id, approvedById: user.id, approvedAt: new Date(),
        reason: isPartial ? `זיכוי חלקי מאצווה ${su.serialNumber} — ${partialLotQty}/${su.lotQuantity}` : "זיכוי מהיר",
        lines: { create: { itemTypeId: su.itemTypeId, quantity: lineQty, serialUnitId: su.id, statusId: statusId || su.statusId } },
      },
    });
  });

  await audit(user.id, "CHECKIN", "SerialUnit", serialUnitId, { soldier: su.signedSoldier?.fullName, partial: isPartial ? partialLotQty : null });
  revalidatePath("/signatures");
}

/** זיכוי כמותי של חייל: יוצר CHECKIN, מחזיר StockBalance למחסן. */
export async function checkinQuantity(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "signatures.manage")) redirect("/signatures");
  const bId = user.battalionId!;
  const soldierId = String(formData.get("soldierId") || "");
  const itemTypeId = String(formData.get("itemTypeId") || "");
  const statusId = String(formData.get("statusId") || "");
  const newStatusId = String(formData.get("newStatusId") || "") || null;
  const quantity = parseInt(String(formData.get("quantity") || "0"), 10);
  const toHolderId = String(formData.get("toHolderId") || "") || (user.holderId ?? null);
  if (!soldierId || !itemTypeId || !statusId || quantity < 1 || !toHolderId) {
    throw new Error("חסרים נתונים — חייל / פריט / כמות / מחסן יעד");
  }

  await prisma.$transaction(async (tx) => {
    const finalStatusId = newStatusId || statusId;
    // מחזיר ל-StockBalance של המחסן עם הסטטוס הסופי
    const existing = await tx.stockBalance.findFirst({
      where: { itemTypeId, holderId: toHolderId, statusId: finalStatusId, battalionId: bId },
    });
    if (existing) {
      await tx.stockBalance.update({ where: { id: existing.id }, data: { quantity: existing.quantity + quantity } });
    } else {
      await tx.stockBalance.create({
        data: { battalionId: bId, itemTypeId, holderId: toHolderId, statusId: finalStatusId, quantity },
      });
    }
    await tx.transfer.create({
      data: {
        battalionId: bId, type: "CHECKIN", status: "COMPLETED",
        toHolderId, toSoldierId: soldierId,
        createdById: user.id, approvedById: user.id, approvedAt: new Date(),
        reason: "זיכוי כמותי מחייל",
        lines: { create: { itemTypeId, quantity, statusId: finalStatusId } },
      },
    });
  });

  await audit(user.id, "CHECKIN_QTY", "Soldier", soldierId, { itemTypeId, quantity });
  revalidatePath("/signatures");
}

/** עטיפה void לשימוש ב-<form action={...}> ב-Server Components */
export async function cancelSignatureForm(formData: FormData): Promise<void> {
  await cancelSignature(formData);
}

/**
 * ביטול תעודת החתמה ממתינה — מבטל את ה-transfer והסיגנטור,
 * ומשחרר את הפריטים הסריאליים שהיו "מנעולים" לאותה החתמה.
 */
export async function cancelSignature(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    if (!can(user.role, "signatures.manage")) return { error: "אין הרשאה" };
    const bId = user.battalionId!;
    const signatureId = String(formData.get("signatureId") || "");
    if (!signatureId) return { error: "חסר מזהה" };

    const sig = await prisma.signature.findUnique({ where: { id: signatureId }, include: { transfer: true } });
    if (!sig || sig.battalionId !== bId) return { error: "לא נמצא" };
    if (sig.status !== "PENDING") return { error: "לא ניתן לבטל — החתימה כבר הושלמה / בוטלה" };

    await prisma.$transaction(async (tx) => {
      await tx.signature.update({ where: { id: signatureId }, data: { status: "CANCELED" } });
      if (sig.transferId) {
        await tx.transfer.update({ where: { id: sig.transferId }, data: { status: "REJECTED" } });
      }
    });
    await audit(user.id, "CANCEL_SIGNATURE", "Signature", signatureId);
    revalidatePath("/signatures");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** עדכון מיקום פיזי (אחריות מול מיקום) */
export async function updatePhysicalLocation(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "signatures.manage")) redirect("/signatures");
  const serialUnitId = String(formData.get("serialUnitId") || "");
  const physicalLocation = String(formData.get("physicalLocation") || "").trim() || null;
  await prisma.serialUnit.update({ where: { id: serialUnitId }, data: { physicalLocation } });
  await audit(user.id, "UPDATE_LOCATION", "SerialUnit", serialUnitId, { physicalLocation });
  revalidatePath("/signatures");
}
