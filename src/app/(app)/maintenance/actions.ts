"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { findTanaHolder, findDefectiveStatusId, findOkStatusId } from "@/lib/tana";
import { adjustQuantity } from "@/lib/inventory";
import { FAULT_STAGE_KEYS, CLOSED_STAGE } from "@/lib/vehicleFault";

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

// ===================== תוכנית טיפולים לרכב =====================

/** שמירת/עדכון תוכנית הטיפול לרכב (תאריך הבא + פרטי מוסך). ריק = ניקוי. */
export async function saveVehicleMaintenance(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const bId = user.battalionId!;
    const vehicleSerialUnitId = String(formData.get("vehicleSerialUnitId") || "");
    if (!vehicleSerialUnitId) return { error: "חסר רכב" };
    const unit = await prisma.serialUnit.findUnique({ where: { id: vehicleSerialUnitId }, select: { battalionId: true } });
    if (!unit || unit.battalionId !== bId) return { error: "רכב לא נמצא" };

    const nextDateRaw = String(formData.get("nextDate") || "").trim();
    const nextDate = nextDateRaw ? new Date(nextDateRaw + "T00:00:00.000Z") : null;
    const serviceType = String(formData.get("serviceType") || "").trim() || null;
    const location = String(formData.get("location") || "").trim() || null;
    const hours = String(formData.get("hours") || "").trim() || null;
    const contactName = String(formData.get("contactName") || "").trim() || null;
    const contactPhone = String(formData.get("contactPhone") || "").trim() || null;
    const notes = String(formData.get("notes") || "").trim() || null;

    // אם הכל ריק — מוחקים את הרשומה
    if (!nextDate && !serviceType && !location && !hours && !contactName && !contactPhone && !notes) {
      await prisma.vehicleMaintenance.deleteMany({ where: { vehicleSerialUnitId } });
      revalidatePath("/maintenance");
      return { ok: true };
    }

    await prisma.vehicleMaintenance.upsert({
      where: { vehicleSerialUnitId },
      update: { nextDate, serviceType, location, hours, contactName, contactPhone, notes, updatedById: user.id,
        // אם שינו את התאריך — מאפסים את סימון "נשלחה תזכורת" כדי שתישלח מחדש
        reminderSentFor: null },
      create: { battalionId: bId, vehicleSerialUnitId, nextDate, serviceType, location, hours, contactName, contactPhone, notes, createdById: user.id },
    });
    await audit(user.id, "SAVE_VEHICLE_MAINTENANCE", "SerialUnit", vehicleSerialUnitId, { nextDate: nextDateRaw || null });
    revalidatePath("/maintenance");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

// ===================== תיק תקלה/טיפול לרכב (מחזור סטטוסים) =====================

async function notifyFaultSoldier(faultId: string, bId: string) {
  const fault = await prisma.vehicleFault.findUnique({
    where: { id: faultId },
    select: { faultNumber: true, description: true, stage: true, vehicleSerialUnit: { select: { serialNumber: true, itemType: { select: { name: true } }, signedSoldier: { select: { fullName: true, telegramChatId: true } } } } },
  });
  const chat = fault?.vehicleSerialUnit.signedSoldier?.telegramChatId;
  if (!fault || !chat) return false;
  const battalion = await prisma.battalion.findUnique({ where: { id: bId }, select: { telegramBotToken: true } });
  if (!battalion?.telegramBotToken) return false;
  const { stageInfo } = await import("@/lib/vehicleFault");
  const { sendTelegramMessage } = await import("@/lib/telegram");
  const v = fault.vehicleSerialUnit;
  await sendTelegramMessage(battalion.telegramBotToken, chat,
    `🔧 <b>תקלה #${fault.faultNumber} — רכב שחתום עליך</b>\n🚙 ${v.itemType.name} · ${v.serialNumber}\n📋 ${fault.description}\nסטטוס: ${stageInfo(fault.stage).short}`).catch(() => {});
  return true;
}

/** יצירת קטגוריות תקלה ברירת-מחדל אם אין. */
export async function ensureFaultCategories(battalionId: string) {
  const cnt = await prisma.vehicleFaultCategory.count({ where: { battalionId } });
  if (cnt > 0) return;
  const { DEFAULT_FAULT_CATEGORIES } = await import("@/lib/vehicleFault");
  await prisma.vehicleFaultCategory.createMany({
    data: DEFAULT_FAULT_CATEGORIES.map((name, i) => ({ battalionId, name, sortOrder: i })),
    skipDuplicates: true,
  });
}

/** הוספת קטגוריית תקלה חדשה (מ"אחר"). מחזיר את ה-id. */
async function resolveCategory(bId: string, categoryIdRaw: string, newName: string, userId: string): Promise<string | null> {
  const categoryId = categoryIdRaw === "__other__" ? "" : categoryIdRaw;
  if (categoryId) {
    const c = await prisma.vehicleFaultCategory.findFirst({ where: { id: categoryId, battalionId: bId }, select: { id: true } });
    return c?.id ?? null;
  }
  const name = newName.trim();
  if (!name) return null;
  const existing = await prisma.vehicleFaultCategory.findFirst({ where: { battalionId: bId, name }, select: { id: true } });
  if (existing) return existing.id;
  const max = await prisma.vehicleFaultCategory.aggregate({ where: { battalionId: bId }, _max: { sortOrder: true } });
  const created = await prisma.vehicleFaultCategory.create({ data: { battalionId: bId, name, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  await audit(userId, "CREATE_FAULT_CATEGORY", "VehicleFaultCategory", created.id, { name });
  return created.id;
}

/** דיווח תקלה חדשה על רכב — פותח תיק תקלה עם מספר רץ. */
export async function reportVehicleFault(formData: FormData): Promise<{ ok?: boolean; error?: string; faultNumber?: number }> {
  try {
    const user = await requireUser();
    const bId = user.battalionId!;
    const vehicleSerialUnitId = String(formData.get("vehicleSerialUnitId") || "");
    const description = String(formData.get("description") || "").trim();
    const notify = formData.get("notify") === "on" || formData.get("notify") === "true";
    if (!vehicleSerialUnitId || !description) return { error: "חסר רכב / תיאור תקלה" };
    const unit = await prisma.serialUnit.findUnique({ where: { id: vehicleSerialUnitId }, select: { battalionId: true, currentHolderId: true } });
    if (!unit || unit.battalionId !== bId) return { error: "רכב לא נמצא" };
    const categoryId = await resolveCategory(bId, String(formData.get("categoryId") || ""), String(formData.get("newCategory") || ""), user.id);

    const fault = await prisma.$transaction(async (tx) => {
      const last = await tx.vehicleFault.findFirst({ where: { battalionId: bId }, orderBy: { faultNumber: "desc" }, select: { faultNumber: true } });
      const faultNumber = (last?.faultNumber ?? 0) + 1;
      const f = await tx.vehicleFault.create({ data: { battalionId: bId, faultNumber, vehicleSerialUnitId, categoryId, description, stage: "reported", openedById: user.id, originHolderId: unit.currentHolderId } });
      await tx.vehicleFaultEvent.create({ data: { faultId: f.id, stage: "reported", note: description, createdById: user.id, createdByName: user.fullName } });
      return f;
    });
    // סימון הרכב כתקול
    const defId = await findDefectiveStatusId(bId);
    if (defId) await prisma.serialUnit.update({ where: { id: vehicleSerialUnitId }, data: { statusId: defId } });
    await audit(user.id, "REPORT_VEHICLE_FAULT", "VehicleFault", fault.id, { faultNumber: fault.faultNumber });
    if (notify) await notifyFaultSoldier(fault.id, bId);
    revalidatePath("/maintenance");
    return { ok: true, faultNumber: fault.faultNumber };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** קידום שלב בתיק תקלה + הערה. שלב "delivered" סוגר את התיק ומחזיר את הרכב לתקין. */
export async function advanceVehicleFault(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const bId = user.battalionId!;
    const faultId = String(formData.get("faultId") || "");
    const stage = String(formData.get("stage") || "");
    const note = String(formData.get("note") || "").trim() || null;
    if (!faultId || !FAULT_STAGE_KEYS.includes(stage)) return { error: "שלב לא תקין" };
    const fault = await prisma.vehicleFault.findUnique({
      where: { id: faultId },
      select: { battalionId: true, vehicleSerialUnitId: true, faultNumber: true, originHolderId: true, atTana: true,
        vehicleSerialUnit: { select: { itemTypeId: true, lotQuantity: true, currentHolderId: true, statusId: true } } },
    });
    if (!fault || fault.battalionId !== bId) return { error: "תיק לא נמצא" };
    const su = fault.vehicleSerialUnit;

    // שלבים בהם הרכב פיזית בטנא
    const AT_TANA_STAGES = ["pulled", "in-service", "waiting-parts", "post-check", "returning"];
    const closing = stage === CLOSED_STAGE;
    const tana = await findTanaHolder(bId);
    const enterTana = !!tana && AT_TANA_STAGES.includes(stage) && !fault.atTana;
    const exitTana = closing && fault.atTana;
    const defId = enterTana ? await findDefectiveStatusId(bId) : null;
    const okId = closing ? await findOkStatusId(bId) : null;
    const backTo = fault.originHolderId ?? su.currentHolderId;

    await prisma.$transaction(async (tx) => {
      await tx.vehicleFault.update({ where: { id: faultId }, data: { stage, closedAt: closing ? new Date() : null, atTana: enterTana ? true : exitTana ? false : fault.atTana } });
      await tx.vehicleFaultEvent.create({ data: { faultId, stage, note, createdById: user.id, createdByName: user.fullName } });
      if (enterTana) {
        await tx.serialUnit.update({ where: { id: fault.vehicleSerialUnitId }, data: { currentHolderId: tana!.id, ...(defId ? { statusId: defId } : {}) } });
        await tx.transfer.create({ data: { battalionId: bId, type: "ISSUE", status: "COMPLETED", fromHolderId: su.currentHolderId, toHolderId: tana!.id,
          reason: `משיכה לטנא — תקלה #${fault.faultNumber}`, createdById: user.id, approvedById: user.id, approvedAt: new Date(),
          lines: { create: { itemTypeId: su.itemTypeId, quantity: su.lotQuantity ?? 1, serialUnitId: fault.vehicleSerialUnitId, statusId: defId ?? su.statusId } } } });
      } else if (exitTana) {
        await tx.serialUnit.update({ where: { id: fault.vehicleSerialUnitId }, data: { ...(backTo ? { currentHolderId: backTo } : {}), ...(okId ? { statusId: okId } : {}) } });
        await tx.transfer.create({ data: { battalionId: bId, type: "RETURN", status: "COMPLETED", fromHolderId: su.currentHolderId, toHolderId: backTo,
          reason: `החזרה מהטנא — תקלה #${fault.faultNumber} נסגרה`, createdById: user.id, approvedById: user.id, approvedAt: new Date(),
          lines: { create: { itemTypeId: su.itemTypeId, quantity: su.lotQuantity ?? 1, serialUnitId: fault.vehicleSerialUnitId, statusId: okId ?? su.statusId } } } });
      } else if (closing && okId) {
        // סגירה בלי שהרכב עבר פיזית לטנא — רק סטטוס לתקין
        await tx.serialUnit.update({ where: { id: fault.vehicleSerialUnitId }, data: { statusId: okId } });
      }
    });
    await audit(user.id, "ADVANCE_VEHICLE_FAULT", "VehicleFault", faultId, { stage, enterTana, exitTana });
    revalidatePath("/maintenance");
    revalidatePath("/stock");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** הוספת הערה לתיק תקלה (בלי שינוי שלב). */
export async function addVehicleFaultNote(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const bId = user.battalionId!;
    const faultId = String(formData.get("faultId") || "");
    const note = String(formData.get("note") || "").trim();
    if (!faultId || !note) return { error: "חסרה הערה" };
    const fault = await prisma.vehicleFault.findUnique({ where: { id: faultId }, select: { battalionId: true } });
    if (!fault || fault.battalionId !== bId) return { error: "תיק לא נמצא" };
    await prisma.vehicleFaultEvent.create({ data: { faultId, stage: "note", note, createdById: user.id, createdByName: user.fullName } });
    revalidatePath("/maintenance");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** שליחת פרטי התקלה לחייל החתום בטלגרם. */
export async function sendFaultToSoldier(formData: FormData): Promise<{ ok?: boolean; error?: string; sent?: boolean }> {
  try {
    const user = await requireUser();
    const bId = user.battalionId!;
    const faultId = String(formData.get("faultId") || "");
    const fault = await prisma.vehicleFault.findUnique({ where: { id: faultId }, select: { battalionId: true } });
    if (!fault || fault.battalionId !== bId) return { error: "תיק לא נמצא" };
    const sent = await notifyFaultSoldier(faultId, bId);
    return { ok: true, sent };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}
