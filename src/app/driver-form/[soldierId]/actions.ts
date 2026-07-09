"use server";

import { prisma } from "@/lib/prisma";
import { type FormType, DEFAULT_VALIDITY_DAYS } from "@/lib/driverForms";

/** מילוי טופס תיק נהג ע"י הנהג עצמו דרך קישור הבוט (ציבורי — לפי soldierId cuid בלתי-ניחוש). */
export async function submitDriverFormPublic(
  soldierId: string,
  formType: FormType,
  data: Record<string, unknown>,
  signature: { signatureData?: string; signerName?: string; signerPersonalNumber?: string },
  license?: { number?: string; grade?: string; expiry?: string },
) {
  const soldier = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { id: true, battalionId: true } });
  if (!soldier) return { error: "לא נמצא" };
  const bId = soldier.battalionId;

  const cfg = await prisma.driverFormValidity.findUnique({ where: { battalionId_formType: { battalionId: bId, formType } } });
  const days = cfg?.validityDays ?? DEFAULT_VALIDITY_DAYS[formType];
  const now = new Date();
  const validUntil = days > 0 ? new Date(now.getTime() + days * 86400000) : null;

  await prisma.driverForm.upsert({
    where: { soldierId_formType: { soldierId, formType } },
    create: {
      battalionId: bId, soldierId, formType, data: data as object,
      signatureData: signature.signatureData || null, signerName: signature.signerName || null, signerPersonalNumber: signature.signerPersonalNumber || null,
      filledAt: now, validUntil,
    },
    update: {
      data: data as object,
      signatureData: signature.signatureData || null, signerName: signature.signerName || null, signerPersonalNumber: signature.signerPersonalNumber || null,
      filledAt: now, validUntil,
    },
  });

  // עדכון פרטי רישיון אזרחי אם נשלחו (הנהג ממלא תוקף/מספר בטופס)
  if (license && (license.number || license.grade || license.expiry)) {
    await prisma.soldier.update({
      where: { id: soldierId },
      data: {
        ...(license.number != null ? { civilianLicenseNumber: license.number || null } : {}),
        ...(license.grade != null ? { civilianLicenseGrade: license.grade || null } : {}),
        ...(license.expiry != null ? { civilianLicenseExpiry: license.expiry ? new Date(license.expiry) : null } : {}),
      },
    });
  }
  return { ok: true };
}
