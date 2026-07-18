"use server";

import { prisma } from "@/lib/prisma";
import { verifyLink } from "@/lib/link-token";
import { uploadAccidentPhoto, isBlobConfigured } from "@/lib/blob";
import type { AccidentPhotoKind } from "@/generated/prisma";

/** ולידציית טוקן מילוי + טעינת דיווח פתוח (DRAFT). null אם לא תקין. */
async function loadDraft(id: string, token: string) {
  if (!verifyLink("accident-fill", id, token)) return null;
  const r = await prisma.accidentReport.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!r || r.status !== "DRAFT") return null;
  return r;
}

/** שמירת שדות חלק א (טקסט) — נקרא אוטומטית בכל שינוי. */
export async function saveAccidentPartA(
  id: string,
  token: string,
  data: {
    accidentAt?: string | null; location?: string; description?: string;
    ourVehiclePlate?: string; ourVehicleType?: string;
    driverName?: string; driverPersonalId?: string; driverPhone?: string;
    otherPartyName?: string; otherPartyId?: string; otherPartyPhone?: string;
    otherVehiclePlate?: string; otherVehicleUnit?: string; otherInsurance?: string;
  },
): Promise<{ ok?: boolean; error?: string }> {
  if (!(await loadDraft(id, token))) return { error: "קישור לא תקין או שהדיווח כבר נשלח" };
  await prisma.accidentReport.update({
    where: { id },
    data: {
      accidentAt: data.accidentAt ? new Date(data.accidentAt) : undefined,
      location: data.location, description: data.description,
      ourVehiclePlate: data.ourVehiclePlate, ourVehicleType: data.ourVehicleType,
      driverName: data.driverName, driverPersonalId: data.driverPersonalId, driverPhone: data.driverPhone,
      otherPartyName: data.otherPartyName, otherPartyId: data.otherPartyId, otherPartyPhone: data.otherPartyPhone,
      otherVehiclePlate: data.otherVehiclePlate, otherVehicleUnit: data.otherVehicleUnit, otherInsurance: data.otherInsurance,
    },
  });
  return { ok: true };
}

/** העלאת תמונה (Blob) לפי סוג — מחליפה תמונה קיימת מאותו סוג. */
export async function uploadAccidentPhotoAction(
  id: string, token: string, kind: AccidentPhotoKind, formData: FormData,
): Promise<{ ok?: boolean; url?: string; error?: string }> {
  if (!(await loadDraft(id, token))) return { error: "קישור לא תקין" };
  if (!isBlobConfigured()) return { error: "אחסון התמונות לא הוגדר עדיין — פנה למנהל המערכת" };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "לא נבחרה תמונה" };
  if (file.size > 12 * 1024 * 1024) return { error: "תמונה גדולה מדי (מקסימום 12MB)" };
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const url = await uploadAccidentPhoto(id, kind, buf, file.type || "image/jpeg");
    await prisma.accidentPhoto.deleteMany({ where: { reportId: id, kind } });
    await prisma.accidentPhoto.create({ data: { reportId: id, kind, blobUrl: url } });
    return { ok: true, url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה בהעלאה" };
  }
}

/** הגשת חלק א — מעביר את הדיווח לטיפול קצין הרכב (OFFICER_REVIEW). */
export async function submitAccidentPartA(id: string, token: string): Promise<{ ok?: boolean; error?: string }> {
  if (!(await loadDraft(id, token))) return { error: "קישור לא תקין או שהדיווח כבר נשלח" };
  await prisma.accidentReport.update({ where: { id }, data: { status: "OFFICER_REVIEW" } });
  return { ok: true };
}
