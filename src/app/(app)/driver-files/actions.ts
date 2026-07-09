"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { type FormType, DEFAULT_VALIDITY_DAYS } from "@/lib/driverForms";

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
  const photo = String(formData.get("licensePhotoData") || "").trim();

  await prisma.soldier.update({
    where: { id: soldierId },
    data: {
      civilianLicenseNumber: number,
      civilianLicenseGrade: grade,
      civilianLicenseExpiry: expiryRaw ? new Date(expiryRaw) : null,
      ...(photo ? { licensePhotoData: photo } : {}),
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
