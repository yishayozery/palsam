import "server-only";
import { prisma } from "./prisma";

export type DriverQualification = { qualified: boolean; reasons: string[] };

/**
 * בודק אם חייל מוסמך לנהוג בסוג רכב מסוים:
 * (1) יש לו את הרישיון/היתר שסוג הרכב דורש (VehicleTypeLicense),
 * (2) חתם על נוהל נהיגה בגרסה בתוקף,
 * (3) ריענון הנהיגה בתוקף (לא פג).
 * לרכב חוץ / נהג חוץ — לא נבדק (מחזירים qualified).
 */
export async function checkDriverQualified(
  soldierId: string,
  vehicleItemTypeId: string | null,
  battalionId: string,
): Promise<DriverQualification> {
  const reasons: string[] = [];
  const [soldier, battalion, required] = await Promise.all([
    prisma.soldier.findUnique({
      where: { id: soldierId },
      select: { drivingRefresherDate: true, drivingProcedureSignedAt: true, civilianLicenseExpiry: true, drivingLicenses: { select: { licenseTypeId: true } } },
    }),
    prisma.battalion.findUnique({ where: { id: battalionId }, select: { drivingRefreshDays: true, drivingProcedureUpdatedAt: true } }),
    vehicleItemTypeId
      ? prisma.vehicleTypeLicense.findMany({ where: { itemTypeId: vehicleItemTypeId }, select: { licenseTypeId: true } })
      : Promise.resolve([]),
  ]);
  if (!soldier) return { qualified: false, reasons: ["חייל לא נמצא"] };

  // (1) רישיון/היתר לסוג הרכב
  const has = new Set(soldier.drivingLicenses.map((l) => l.licenseTypeId));
  const missing = required.map((r) => r.licenseTypeId).filter((id) => !has.has(id));
  if (missing.length) reasons.push("חסר רישיון/היתר לסוג הרכב");

  // (2) נוהל נהיגה
  if (!soldier.drivingProcedureSignedAt) reasons.push("לא חתם על נוהל נהיגה");
  else if (battalion?.drivingProcedureUpdatedAt && soldier.drivingProcedureSignedAt < battalion.drivingProcedureUpdatedAt) reasons.push("נוהל נהיגה עודכן — חתימה מחדש");

  // (3) ריענון נהיגה
  if (!soldier.drivingRefresherDate) reasons.push("לא בוצע ריענון נהיגה");
  else {
    const exp = new Date(soldier.drivingRefresherDate);
    exp.setDate(exp.getDate() + (battalion?.drivingRefreshDays ?? 180));
    if (exp.getTime() < Date.now()) reasons.push("ריענון נהיגה פג");
  }

  // (4) תוקף רישיון אזרחי — פג ⇒ לא מוסמך (חלק מבדיקת שיבוץ נהג)
  if (soldier.civilianLicenseExpiry && new Date(soldier.civilianLicenseExpiry).getTime() < Date.now()) {
    reasons.push("רישיון נהיגה אזרחי פג תוקף");
  }

  return { qualified: reasons.length === 0, reasons };
}
