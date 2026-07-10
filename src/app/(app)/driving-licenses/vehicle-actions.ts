"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

async function guard() {
  const user = await requireCapability("dispatch.manage");
  return { user, bId: user.battalionId! };
}

// ===================== כרטיסי דלק =====================

/** משיכת כרטיס דלק ע"י חייל (קצין רכב מזין, או החייל דרך הבוט). */
export async function addFuelCard(formData: FormData) {
  const { user, bId } = await guard();
  const soldierId = String(formData.get("soldierId") || "");
  const cardNumber = String(formData.get("cardNumber") || "").trim();
  const note = String(formData.get("note") || "").trim() || null;
  const signatureData = String(formData.get("signatureData") || "").trim() || null;
  if (!soldierId || !cardNumber) return { error: "חסר חייל / מספר כרטיס" };
  const s = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { battalionId: true, fullName: true } });
  if (!s || s.battalionId !== bId) return { error: "חייל לא נמצא" };
  const signed = signatureData?.startsWith("data:image/") ? signatureData : null;
  await prisma.vehicleFuelCard.create({
    data: { battalionId: bId, soldierId, cardNumber, note, createdById: user.id,
      signatureData: signed, signerName: signed ? s.fullName : null, signedAt: signed ? new Date() : null },
  });
  await audit(user.id, "ADD_FUEL_CARD", "Soldier", soldierId, { cardNumber });
  revalidatePath("/driving-licenses");
  return { ok: true };
}

/** שליחת לינק חתימה מרחוק לחייל (בוט טלגרם) + החזרת הלינק לשיתוף ידני. */
export async function sendFuelSignLink(cardId: string): Promise<{ ok?: boolean; error?: string; link?: string; telegramSent?: boolean }> {
  const { bId } = await guard();
  const card = await prisma.vehicleFuelCard.findUnique({
    where: { id: cardId },
    select: { battalionId: true, signedAt: true, cardNumber: true, soldier: { select: { fullName: true, telegramChatId: true } } },
  });
  if (!card || card.battalionId !== bId) return { error: "לא נמצא" };
  if (card.signedAt) return { error: "כבר נחתם" };
  const { linkTokenQuery } = await import("@/lib/link-token");
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
  const link = `${base}/fuel-sign/${cardId}${linkTokenQuery("fuel-sign", cardId)}`;
  let telegramSent = false;
  if (card.soldier.telegramChatId) {
    const battalion = await prisma.battalion.findUnique({ where: { id: bId }, select: { telegramBotToken: true } });
    if (battalion?.telegramBotToken) {
      const { sendTelegramMessage } = await import("@/lib/telegram");
      await sendTelegramMessage(battalion.telegramBotToken, card.soldier.telegramChatId,
        `⛽ <b>חתימה על קבלת כרטיס דלק</b>\n\n${card.soldier.fullName}, קיבלת כרטיס ${card.cardNumber}.\n👉 <a href="${link}">לחץ כאן לחתימה על הקבלה</a>`).then(() => { telegramSent = true; }).catch(() => {});
    }
  }
  await prisma.vehicleFuelCard.update({ where: { id: cardId }, data: { signLinkSentAt: new Date() } });
  revalidatePath("/driving-licenses");
  return { ok: true, link, telegramSent };
}

/** החזרת כרטיס (סוגר את הכרטיס — רושם תאריך החזרה). */
export async function returnFuelCard(id: string) {
  const { user, bId } = await guard();
  const c = await prisma.vehicleFuelCard.findUnique({ where: { id }, select: { battalionId: true } });
  if (!c || c.battalionId !== bId) return { error: "לא נמצא" };
  await prisma.vehicleFuelCard.update({ where: { id }, data: { returnedAt: new Date() } });
  await audit(user.id, "RETURN_FUEL_CARD", "VehicleFuelCard", id);
  revalidatePath("/driving-licenses");
  return { ok: true };
}

/** מחיקת רשומת כרטיס (טעות). */
export async function deleteFuelCard(id: string) {
  const { user, bId } = await guard();
  const c = await prisma.vehicleFuelCard.findUnique({ where: { id }, select: { battalionId: true } });
  if (!c || c.battalionId !== bId) return { error: "לא נמצא" };
  await prisma.vehicleFuelCard.delete({ where: { id } });
  await audit(user.id, "DELETE_FUEL_CARD", "VehicleFuelCard", id);
  revalidatePath("/driving-licenses");
  return { ok: true };
}

// ===================== קישורים =====================

/** שמירת/עדכון קישור (שם + לינק + האם מוצג לחייל). */
export async function saveVehicleLink(formData: FormData) {
  const { user, bId } = await guard();
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  let url = String(formData.get("url") || "").trim();
  const visibleToSoldier = formData.get("visibleToSoldier") === "on" || formData.get("visibleToSoldier") === "true";
  if (!name || !url) return { error: "חסר שם / קישור" };
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  if (id) {
    const ex = await prisma.vehicleLink.findUnique({ where: { id }, select: { battalionId: true } });
    if (!ex || ex.battalionId !== bId) return { error: "לא נמצא" };
    await prisma.vehicleLink.update({ where: { id }, data: { name, url, visibleToSoldier } });
  } else {
    const max = await prisma.vehicleLink.count({ where: { battalionId: bId } });
    await prisma.vehicleLink.create({ data: { battalionId: bId, name, url, visibleToSoldier, sortOrder: max } });
  }
  await audit(user.id, id ? "UPDATE" : "CREATE", "VehicleLink", id || name);
  revalidatePath("/driving-licenses");
  return { ok: true };
}

export async function deleteVehicleLink(id: string) {
  const { user, bId } = await guard();
  const l = await prisma.vehicleLink.findUnique({ where: { id }, select: { battalionId: true } });
  if (!l || l.battalionId !== bId) return { error: "לא נמצא" };
  await prisma.vehicleLink.delete({ where: { id } });
  await audit(user.id, "DELETE", "VehicleLink", id);
  revalidatePath("/driving-licenses");
  return { ok: true };
}
