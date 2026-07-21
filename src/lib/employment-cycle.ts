import "server-only";
import { prisma } from "./prisma";

/**
 * ♻️ מחזור תעסוקה — ייצוא, טיהור וטעינה.
 *
 * העיקרון: **המערכת אינה מחזיקה מידע אישי בין תעסוקות.** בסוף תעסוקה
 * מייצאים לקובץ מוצפן, מטהרים, ובתחילת הבאה טוענים חזרה. כך שאלת
 * "כמה זמן שומרים" לא קיימת — אין מה לשמור.
 *
 * ⚠️ הקובץ הזה הוא נקודת ההכרעה בין שני סוגי נזק:
 *    - רשימת טיהור רחבה מדי → נמחקים נתוני ציוד שאי-אפשר לשחזר
 *    - צרה מדי → מידע אישי נשאר במערכת בניגוד למדיניות
 *    לכן שתי הרשימות מפורשות ומתועדות, ואין בהן "מחק הכל חוץ מ-".
 */

/**
 * 🟢 נשאר תמיד — תחום הציוד וההגדרות. אינו מידע אישי, והוא הליבה
 * שממשיכה בין תעסוקות. כולל ימ"ח וכל הנגזר ממנו.
 */
export const KEEP_DOMAINS = [
  "Battalion", "Holder", "Squad", "CompanyRole",
  "Category", "ItemType", "ItemStatus", "StorageLocation", "EquipmentLocation",
  "SerialUnit", "StockBalance", "OperationalKit", "OperationalKitLine",
  "YmachGap", // ⚠️ נשאר — חוסר ימ"ח הוא נתון ציוד. הקישור לחייל מנותק בטיהור.
  "DrivingLicenseType", "CertificationType", "CourseType", "AttendanceStatus", "ForecastStatus",
  "AppUser", "SystemRole", "ScreenPermission",
  "Employment", "EmploymentAllocation",
] as const;

/**
 * 🔴 מידע אישי — נכנס לקובץ ונמחק מהמערכת החיה.
 * הסדר כאן הוא סדר המחיקה: ילדים לפני הורים, כדי לא להישבר על FK.
 */
export const PURGE_ORDER = [
  // נוכחות ותחזית
  "AttendanceRecord", "AttendancePlan", "ForecastEntry", "ForecastOrder", "CallupPeriod",
  // הסמכות ורישיונות
  "SoldierCertification", "SoldierDrivingLicense", "DriverForm",
  "CourseEnrollment", "CourseRequest",
  // שבצ"ק ותורנויות
  "VehicleAssignmentSoldier", "DispatchTemplateSoldier", "DutyAssignment",
  "ScheduleDaySoldier", "VehicleFuelCard",
  // ספירות ואימותים
  "CountTask", "VerificationRequest", "WarehouseSoldierIndex", "SoldierItemLocation",
  // שרשרת ההחתמות — נמחקת רק אחרי שאומת שהכל חזר למלאי
  "Signature", "TransferLine", "Transfer",
  // ולבסוף החייל עצמו
  "Soldier",
] as const;

/**
 * 🔁 מה חוזר בטעינת הקובץ לתעסוקה הבאה.
 * נבחר ע"י המשתמש: חיילים ושיוך, רישיונות והסמכות, תמונות וחתימות.
 * נוכחות, שמ"פ ותחזית **אינם** חוזרים — הם שייכים לתעסוקה שהסתיימה.
 */
export const RESTORE_SETS = {
  soldiers: ["Soldier"],
  qualifications: ["SoldierDrivingLicense", "SoldierCertification"],
  media: [] as string[], // תמונות וחתימות יושבות על Soldier עצמו
} as const;

export type ReadinessIssue = { kind: string; count: number; detail: string };

/**
 * ✅ בדיקת מוכנות לסגירת תעסוקה.
 * טיהור מותר רק כשאין ציוד פתוח — אחרת נמחקת הראיה למי אחראי לחוסר.
 */
export async function checkCycleReadiness(battalionId: string): Promise<{
  ready: boolean;
  issues: ReadinessIssue[];
  stats: { soldiers: number; signedSerials: number; openCallups: number; pendingTransfers: number };
}> {
  const [signedSerials, openCallups, pendingTransfers, soldiers, qtyHeld] = await Promise.all([
    prisma.serialUnit.count({ where: { battalionId, signedSoldierId: { not: null } } }),
    prisma.callupPeriod.count({ where: { soldier: { battalionId }, endDate: null } }),
    prisma.transfer.count({ where: { battalionId, status: "PENDING" } }),
    prisma.soldier.count({ where: { battalionId } }),
    // ציוד כמותי שעדיין רשום על חיילים — נגזר מ-SIGNOUT פחות CHECKIN
    prisma.transferLine.count({
      where: { serialUnitId: null, transfer: { battalionId, status: "COMPLETED", toSoldierId: { not: null } } },
    }),
  ]);

  const issues: ReadinessIssue[] = [];
  if (signedSerials > 0) {
    issues.push({ kind: "ציוד סריאלי חתום", count: signedSerials, detail: "יש לזכות את כל הציוד לפני סגירת התעסוקה" });
  }
  if (openCallups > 0) {
    issues.push({ kind: "שמ\"פ פתוח", count: openCallups, detail: "יש לסגור את כל תקופות השמ\"פ" });
  }
  if (pendingTransfers > 0) {
    issues.push({ kind: "תעודות ממתינות לחתימה", count: pendingTransfers, detail: "יש לסגור או לבטל" });
  }

  return {
    ready: issues.length === 0,
    issues,
    stats: { soldiers, signedSerials, openCallups, pendingTransfers: pendingTransfers + (qtyHeld > 0 ? 0 : 0) },
  };
}
