"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { type FormType, DEFAULT_VALIDITY_DAYS, DRIVER_FORMS, FORM_ORDER, FORM_TITLES } from "@/lib/driverForms";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";

async function guard() {
  const user = await requireCapability("dispatch.manage");
  return { user, bId: user.battalionId! };
}

/** שמירת פרטי רישיון אזרחי + צילום רישיון (קובץ 4). */
export async function saveLicenseDetails(formData: FormData) {
  const { user, bId } = await guard();
  const soldierId = String(formData.get("soldierId") || "");
  const soldier = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { battalionId: true } });
  if (!soldier || soldier.battalionId !== bId) return { error: "חייל לא נמצא" };

  const number = String(formData.get("civilianLicenseNumber") || "").trim() || null;
  const grade = String(formData.get("civilianLicenseGrade") || "").trim() || null;
  const expiryRaw = String(formData.get("civilianLicenseExpiry") || "").trim();
  // צילומים — כל שדה שנשלח מתעדכן ("" = הסרה); שדה שלא נשלח נשאר כמו שהוא
  const photoField = (key: keyof typeof photoMap) => {
    const v = formData.get(key as string);
    return v == null ? undefined : (String(v).trim() || null);
  };
  const photoMap = { civilianLicenseFrontData: 0, civilianLicenseBackData: 0, militaryLicenseFrontData: 0 } as const;

  await prisma.soldier.update({
    where: { id: soldierId },
    data: {
      civilianLicenseNumber: number,
      civilianLicenseGrade: grade,
      civilianLicenseExpiry: expiryRaw ? new Date(expiryRaw) : null,
      ...(photoField("civilianLicenseFrontData") !== undefined ? { civilianLicenseFrontData: photoField("civilianLicenseFrontData") } : {}),
      ...(photoField("civilianLicenseBackData") !== undefined ? { civilianLicenseBackData: photoField("civilianLicenseBackData") } : {}),
      ...(photoField("militaryLicenseFrontData") !== undefined ? { militaryLicenseFrontData: photoField("militaryLicenseFrontData") } : {}),
    },
  });
  await audit(user.id, "SAVE_DRIVER_LICENSE", "Soldier", soldierId, { expiry: expiryRaw });
  revalidatePath(`/driver-files/${soldierId}`);
  revalidatePath("/driver-files");
  return { ok: true };
}

/** הסרת צילום רישיון. */
export async function removeLicensePhoto(soldierId: string) {
  const { bId } = await guard();
  const soldier = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { battalionId: true } });
  if (!soldier || soldier.battalionId !== bId) return { error: "חייל לא נמצא" };
  await prisma.soldier.update({ where: { id: soldierId }, data: { licensePhotoData: null } });
  revalidatePath(`/driver-files/${soldierId}`);
  return { ok: true };
}

/** שמירת/עדכון טופס תיק נהג (upsert) + חישוב תוקף לפי הגדרת הגדוד. */
export async function saveDriverForm(
  soldierId: string,
  formType: FormType,
  data: Record<string, unknown>,
  signature: { signatureData?: string; signerName?: string; signerPersonalNumber?: string },
) {
  const { user, bId } = await guard();
  const soldier = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { battalionId: true } });
  if (!soldier || soldier.battalionId !== bId) return { error: "חייל לא נמצא" };

  const cfg = await prisma.driverFormValidity.findUnique({ where: { battalionId_formType: { battalionId: bId, formType } } });
  const days = cfg?.validityDays ?? DEFAULT_VALIDITY_DAYS[formType];
  const now = new Date();
  const validUntil = days > 0 ? new Date(now.getTime() + days * 86400000) : null;

  await prisma.driverForm.upsert({
    where: { soldierId_formType: { soldierId, formType } },
    create: {
      battalionId: bId, soldierId, formType, data: data as object,
      signatureData: signature.signatureData || null, signerName: signature.signerName || null, signerPersonalNumber: signature.signerPersonalNumber || null,
      filledById: user.id, filledAt: now, validUntil,
    },
    update: {
      data: data as object,
      signatureData: signature.signatureData || null, signerName: signature.signerName || null, signerPersonalNumber: signature.signerPersonalNumber || null,
      filledById: user.id, filledAt: now, validUntil,
    },
  });
  await audit(user.id, "SAVE_DRIVER_FORM", "Soldier", soldierId, { formType });
  revalidatePath(`/driver-files/${soldierId}`);
  revalidatePath("/driver-files");
  return { ok: true };
}

const formsMsg = (name: string, battalionName: string, soldierId: string, incomplete: string[]) => {
  const lines = [`📁 <b>טפסי נהג — ${battalionName}</b>`, ``, `${name}, נדרש למלא ולחתום על טפסי תיק הנהג ולשלוח צילומי רישיון.`];
  if (incomplete.length > 0) lines.push(``, `⚠️ טרם הושלם:`, ...incomplete.map((x) => `• ${x}`));
  lines.push(``, `👉 <a href="${BASE}/driver-form/${soldierId}">לחץ כאן להשלמה</a>`);
  return lines.join("\n");
};

type DriverFileState = { driverForms: { formType: string }[]; civilianLicenseFrontData: string | null; civilianLicenseBackData: string | null; militaryLicenseFrontData: string | null };
/** רשימת מה שעדיין לא הושלם — טפסים (שאינם officerOnly) + צילומי רישיון. */
function incompleteItems(s: DriverFileState): string[] {
  const done = new Set(s.driverForms.map((f) => f.formType));
  const items: string[] = [];
  for (const ft of FORM_ORDER) if (!DRIVER_FORMS[ft].officerOnly && !done.has(ft)) items.push(FORM_TITLES[ft]);
  if (!s.civilianLicenseFrontData) items.push("צילום רישיון אזרחי — קדימה");
  if (!s.civilianLicenseBackData) items.push("צילום רישיון אזרחי — אחורה");
  if (!s.militaryLicenseFrontData) items.push("צילום רישיון צבאי — קדימה");
  return items;
}
const DF_SELECT = { driverForms: { select: { formType: true } }, civilianLicenseFrontData: true, civilianLicenseBackData: true, militaryLicenseFrontData: true } as const;

/** שליחת קישור מילוי הטפסים לנהג בודד בבוט (כולל מה שטרם הושלם). */
export async function sendDriverFormsLink(soldierId: string) {
  const { bId } = await guard();
  const soldier = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { battalionId: true, fullName: true, telegramChatId: true, ...DF_SELECT } });
  if (!soldier || soldier.battalionId !== bId) return { error: "חייל לא נמצא" };
  if (!soldier.telegramChatId) return { error: "הנהג אינו מחובר לבוט" };
  const battalion = await prisma.battalion.findUnique({ where: { id: bId }, select: { telegramBotToken: true, name: true } });
  if (!battalion?.telegramBotToken) return { error: "לגדוד אין בוט" };
  const { sendTelegramMessage } = await import("@/lib/telegram");
  await sendTelegramMessage(battalion.telegramBotToken, soldier.telegramChatId, formsMsg(soldier.fullName, battalion.name, soldierId, incompleteItems(soldier))).catch(() => {});
  return { ok: true };
}

/** שליחת קישור מילוי הטפסים לנהגים נבחרים (רשימת מזהים) — לא לכולם ללא בחירה. */
export async function sendDriverFormsToMany(soldierIds: string[]) {
  const { bId } = await guard();
  if (!soldierIds.length) return { error: "לא נבחרו נהגים" };
  const battalion = await prisma.battalion.findUnique({ where: { id: bId }, select: { telegramBotToken: true, name: true } });
  if (!battalion?.telegramBotToken) return { error: "לגדוד אין בוט" };
  const soldiers = await prisma.soldier.findMany({
    where: { id: { in: soldierIds }, battalionId: bId, telegramChatId: { not: null } },
    select: { id: true, fullName: true, telegramChatId: true, ...DF_SELECT },
  });
  if (soldiers.length === 0) return { ok: true, sent: 0 };
  const { sendTelegramMessage } = await import("@/lib/telegram");
  const token = battalion.telegramBotToken;
  let sent = 0;
  for (let i = 0; i < soldiers.length; i += 20) {
    const batch = soldiers.slice(i, i + 20);
    const res = await Promise.allSettled(batch.map((s) => sendTelegramMessage(token, s.telegramChatId!, formsMsg(s.fullName, battalion.name, s.id, incompleteItems(s)))));
    sent += res.filter((r) => r.status === "fulfilled").length;
  }
  return { ok: true, sent };
}

/** מחיקת טופס תיק נהג (אם לא תקין) — חוזר ל"טרם מולא"; אפשר לשלוח שוב לנהג. */
export async function deleteDriverForm(soldierId: string, formType: FormType) {
  const { user, bId } = await guard();
  const soldier = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { battalionId: true } });
  if (!soldier || soldier.battalionId !== bId) return { error: "חייל לא נמצא" };
  await prisma.driverForm.deleteMany({ where: { soldierId, formType } });
  await audit(user.id, "DELETE_DRIVER_FORM", "Soldier", soldierId, { formType });
  revalidatePath(`/driver-files/${soldierId}`);
  revalidatePath("/driving-licenses");
  return { ok: true };
}

/** אישור / ביטול-אישור תיק נהג ע"י קצין רכב. */
export async function toggleDriverFileApproval(soldierId: string) {
  const { user, bId } = await guard();
  const soldier = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { battalionId: true, driverFileApprovedAt: true } });
  if (!soldier || soldier.battalionId !== bId) return { error: "חייל לא נמצא" };
  const approve = !soldier.driverFileApprovedAt;
  await prisma.soldier.update({
    where: { id: soldierId },
    data: { driverFileApprovedAt: approve ? new Date() : null, driverFileApprovedById: approve ? user.id : null },
  });
  await audit(user.id, approve ? "APPROVE_DRIVER_FILE" : "UNAPPROVE_DRIVER_FILE", "Soldier", soldierId);
  revalidatePath("/driving-licenses");
  revalidatePath(`/driver-files/${soldierId}`);
  return { ok: true, approved: approve };
}

/** הגדרת ימי תוקף פר-סוג-טופס (רמת גדוד). */
export async function saveFormValidity(formData: FormData) {
  const { user, bId } = await guard();
  const formType = String(formData.get("formType") || "") as FormType;
  const days = Math.max(0, parseInt(String(formData.get("validityDays") || "0"), 10) || 0);
  if (!formType) return { error: "סוג טופס חסר" };
  await prisma.driverFormValidity.upsert({
    where: { battalionId_formType: { battalionId: bId, formType } },
    create: { battalionId: bId, formType, validityDays: days },
    update: { validityDays: days },
  });
  await audit(user.id, "SAVE_DRIVER_FORM_VALIDITY", "Battalion", bId, { formType, days });
  revalidatePath("/driver-files");
  return { ok: true };
}
