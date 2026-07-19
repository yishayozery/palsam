"use server";

import { prisma } from "@/lib/prisma";
import { verifyLink } from "@/lib/link-token";
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

/** שמירת תמונה (data-URL — הוקטנה בצד-הלקוח) לפי סוג — מחליפה קיימת מאותו סוג.
 *  עקבי עם שאר התמונות במערכת (רישיונות/חתימות = data-URL ב-DB). */
export async function saveAccidentPhotoData(
  id: string, token: string, kind: AccidentPhotoKind, dataUrl: string,
): Promise<{ ok?: boolean; url?: string; error?: string }> {
  if (!(await loadDraft(id, token))) return { error: "קישור לא תקין" };
  if (!dataUrl.startsWith("data:image/")) return { error: "קובץ לא תקין" };
  if (dataUrl.length > 2_500_000) return { error: "תמונה גדולה מדי — נסה/י שוב (מוקטנת אוטומטית)" };
  try {
    await prisma.accidentPhoto.deleteMany({ where: { reportId: id, kind } });
    await prisma.accidentPhoto.create({ data: { reportId: id, kind, blobUrl: dataUrl } });
    return { ok: true, url: dataUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה בשמירה" };
  }
}

/** הגשת חלק א — מעביר לטיפול קצין הרכב (OFFICER_REVIEW).
 *  לפני ההגשה: מעתיק רישיונות שכבר קיימים במערכת על החייל לדיווח (אם לא הועלו ידנית),
 *  כדי שהתעודה תהיה שלמה בלי לבקש מהחייל לצלם שוב מה שכבר יש. */
export async function submitAccidentPartA(id: string, token: string): Promise<{ ok?: boolean; error?: string }> {
  if (!(await loadDraft(id, token))) return { error: "קישור לא תקין או שהדיווח כבר נשלח" };

  const rep = await prisma.accidentReport.findUnique({
    where: { id },
    select: { reportingSoldierId: true, battalionId: true, type: true, driverName: true, location: true, ourVehiclePlate: true, photos: { select: { kind: true } } },
  });
  if (rep?.reportingSoldierId) {
    const have = new Set(rep.photos.map((p) => p.kind));
    const sol = await prisma.soldier.findUnique({
      where: { id: rep.reportingSoldierId },
      select: { civilianLicenseFrontData: true, civilianLicenseBackData: true, militaryLicenseFrontData: true },
    });
    const copy: { kind: AccidentPhotoKind; data: string | null }[] = [
      { kind: "CIVIL_LICENSE_FRONT", data: sol?.civilianLicenseFrontData ?? null },
      { kind: "CIVIL_LICENSE_BACK", data: sol?.civilianLicenseBackData ?? null },
      { kind: "MILITARY_LICENSE", data: sol?.militaryLicenseFrontData ?? null },
    ];
    for (const c of copy) {
      if (c.data && !have.has(c.kind)) {
        await prisma.accidentPhoto.create({ data: { reportId: id, kind: c.kind, blobUrl: c.data } });
      }
    }
  }

  await prisma.accidentReport.update({ where: { id }, data: { status: "OFFICER_REVIEW" } });

  // 🔔 התראה לקצין הרכב
  if (rep) {
    const TYPE_LABEL: Record<string, string> = { ARMY_SELF: "צבא עצמי", ARMY_ARMY: "צבא עם צבא", CIVILIAN: "מעורבות אזרח" };
    const summary = [TYPE_LABEL[rep.type] ?? rep.type, rep.driverName, rep.ourVehiclePlate && `רכב ${rep.ourVehiclePlate}`, rep.location].filter(Boolean).join(" · ");
    const { notifyVehicleOfficersAccident } = await import("@/lib/accident-notify");
    await notifyVehicleOfficersAccident(rep.battalionId, id, summary).catch(() => {});
  }
  return { ok: true };
}
