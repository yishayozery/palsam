"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability, requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export async function saveLicenseType(formData: FormData) {
  const user = await requireCapability("dispatch.manage");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const kindRaw = String(formData.get("kind") || "").trim().toUpperCase();
  const kind = kindRaw === "LICENSE" ? "LICENSE" : kindRaw === "PERMIT" ? "PERMIT" : undefined;
  if (!name) return;

  if (id) {
    const existing = await prisma.drivingLicenseType.findUnique({ where: { id } });
    if (!existing || existing.battalionId !== bId) return;
    await prisma.drivingLicenseType.update({ where: { id }, data: { name, ...(kind ? { kind } : {}) } });
  } else {
    await prisma.drivingLicenseType.create({ data: { battalionId: bId, name, ...(kind ? { kind } : {}) } });
  }
  await audit(user.id, "UPSERT", "DrivingLicenseType", id || "new", { name });
  revalidatePath("/driving-licenses");
}

export async function toggleLicenseType(formData: FormData) {
  const user = await requireCapability("dispatch.manage");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const existing = await prisma.drivingLicenseType.findUnique({ where: { id } });
  if (!existing || existing.battalionId !== bId) return;
  await prisma.drivingLicenseType.update({ where: { id }, data: { active: !existing.active } });
  await audit(user.id, "TOGGLE", "DrivingLicenseType", id);
  revalidatePath("/driving-licenses");
}

export async function saveSoldierLicenses(formData: FormData) {
  const user = await requireUser();
  const bId = user.battalionId!;
  const isAdmin = can(user, "battalion.profile");
  const isVehicleOfficer = user.role === "WAREHOUSE_MANAGER";
  if (!isAdmin && !isVehicleOfficer && !can(user, "dispatch.manage")) return;

  const soldierId = String(formData.get("soldierId") || "");
  const soldier = await prisma.soldier.findUnique({ where: { id: soldierId } });
  if (!soldier || soldier.battalionId !== bId) return;

  const licenseTypeIds = formData.getAll("licenseTypeId").map(String);
  const refresherDate = String(formData.get("refresherDate") || "");

  await prisma.$transaction(async (tx) => {
    await tx.soldierDrivingLicense.deleteMany({ where: { soldierId } });
    if (licenseTypeIds.length > 0) {
      await tx.soldierDrivingLicense.createMany({
        data: licenseTypeIds.map((licenseTypeId) => ({
          soldierId,
          licenseTypeId,
        })),
      });
    }
    await tx.soldier.update({
      where: { id: soldierId },
      data: { drivingRefresherDate: refresherDate ? new Date(refresherDate) : null },
    });
  });
  await audit(user.id, "UPDATE_LICENSES", "Soldier", soldierId, { count: licenseTypeIds.length });
  revalidatePath("/driving-licenses");
}

export async function updateRefreshDays(formData: FormData) {
  const user = await requireUser();
  if (!can(user, "battalion.profile")) return;
  const bId = user.battalionId!;
  const days = parseInt(String(formData.get("days") || "180"), 10);
  if (isNaN(days) || days < 1) return;
  await prisma.battalion.update({ where: { id: bId }, data: { drivingRefreshDays: days } });
  await audit(user.id, "UPDATE", "Battalion", bId, { drivingRefreshDays: days });
  revalidatePath("/driving-licenses");
}

/** קצין רכב/אדמין: שמירת נוסח נוהל הנהיגה שנשלח לחתימה. */
export async function saveDrivingProcedureText(formData: FormData) {
  const user = await requireUser();
  const isAdmin = can(user, "battalion.profile");
  const isVehicleOfficer = user.role === "WAREHOUSE_MANAGER";
  if (!isAdmin && !isVehicleOfficer && !can(user, "dispatch.manage")) return;
  const bId = user.battalionId!;
  const text = String(formData.get("text") || "").trim() || null;
  const current = await prisma.battalion.findUnique({ where: { id: bId }, select: { drivingProcedureText: true } });
  const changed = (current?.drivingProcedureText ?? null) !== text;
  await prisma.battalion.update({
    where: { id: bId },
    // עדכון הנוסח = גרסה חדשה → מרעננים את חותם-הזמן, וכל חתימה ישנה נחשבת לא-תקפה
    data: { drivingProcedureText: text, ...(changed ? { drivingProcedureUpdatedAt: new Date() } : {}) },
  });
  await audit(user.id, "UPDATE", "Battalion", bId, { drivingProcedureText: !!text, versionBumped: changed });
  revalidatePath("/driving-licenses");
}

/** סימון ידני שחייל חתם על נוהל נהיגה (ע"י קצין רכב). toggle. */
export async function markProcedureSigned(formData: FormData) {
  const user = await requireUser();
  const isAdmin = can(user, "battalion.profile");
  const isVehicleOfficer = user.role === "WAREHOUSE_MANAGER";
  if (!isAdmin && !isVehicleOfficer && !can(user, "dispatch.manage")) return;
  const bId = user.battalionId!;
  const soldierId = String(formData.get("soldierId") || "");
  const s = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { battalionId: true, drivingProcedureSignedAt: true } });
  if (!s || s.battalionId !== bId) return;
  await prisma.soldier.update({ where: { id: soldierId }, data: { drivingProcedureSignedAt: s.drivingProcedureSignedAt ? null : new Date() } });
  await audit(user.id, "PROCEDURE_SIGN_MANUAL", "Soldier", soldierId);
  revalidatePath("/driving-licenses");
}

/** שליחת נוהל נהיגה לחייל בבוט לחתימה (כפתור inline). */
export async function sendDrivingProcedureForSign(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const user = await requireUser();
  const isAdmin = can(user, "battalion.profile");
  const isVehicleOfficer = user.role === "WAREHOUSE_MANAGER";
  if (!isAdmin && !isVehicleOfficer && !can(user, "dispatch.manage")) return { error: "אין הרשאה" };
  const bId = user.battalionId!;
  const soldierId = String(formData.get("soldierId") || "");
  const [soldier, battalion] = await Promise.all([
    prisma.soldier.findUnique({ where: { id: soldierId }, select: { battalionId: true, telegramChatId: true, fullName: true } }),
    prisma.battalion.findUnique({ where: { id: bId }, select: { telegramBotToken: true, drivingProcedureText: true } }),
  ]);
  if (!soldier || soldier.battalionId !== bId) return { error: "חייל לא נמצא" };
  if (!battalion?.telegramBotToken) return { error: "לא הוגדר בוט טלגרם" };
  if (!battalion.drivingProcedureText) return { error: "לא הוגדר נוסח נוהל נהיגה" };
  if (!soldier.telegramChatId) return { error: "החייל לא מחובר לבוט" };
  const { sendTelegramMessage } = await import("@/lib/telegram");
  const text = `🚗 <b>נוהל נהיגה — לחתימה</b>\n\n${battalion.drivingProcedureText}\n\nיש לאשר קריאה וחתימה:`;
  await sendTelegramMessage(battalion.telegramBotToken, soldier.telegramChatId, text, {
    inline_keyboard: [[{ text: "✍️ אני מאשר וחותם", callback_data: `signproc:${soldierId}` }]],
  });
  await audit(user.id, "PROCEDURE_SEND", "Soldier", soldierId);
  return { ok: true };
}

export async function saveVehicleTypeLicenses(formData: FormData) {
  const user = await requireUser();
  const bId = user.battalionId!;
  const isAdmin = can(user, "battalion.profile");
  const isVehicleOfficer = user.role === "WAREHOUSE_MANAGER";
  if (!isAdmin && !isVehicleOfficer && !can(user, "dispatch.manage")) return;

  const itemTypeId = String(formData.get("itemTypeId") || "");
  const itemType = await prisma.itemType.findUnique({ where: { id: itemTypeId } });
  if (!itemType || itemType.battalionId !== bId) return;

  const licenseTypeIds = formData.getAll("licenseTypeId").map(String);

  await prisma.$transaction(async (tx) => {
    await tx.vehicleTypeLicense.deleteMany({ where: { itemTypeId } });
    if (licenseTypeIds.length > 0) {
      await tx.vehicleTypeLicense.createMany({
        data: licenseTypeIds.map((licenseTypeId) => ({
          itemTypeId,
          licenseTypeId,
        })),
      });
    }
  });
  await audit(user.id, "UPDATE_VEHICLE_LICENSES", "ItemType", itemTypeId, { count: licenseTypeIds.length });
  revalidatePath("/driving-licenses");
}
