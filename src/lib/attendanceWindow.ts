import "server-only";
import { prisma } from "./prisma";

/**
 * התאריך המקסימלי (YYYY-MM-DD, שעון ישראל) שמותר לדווח עליו ביום נתון.
 * לפי הגדרת חלון-הדיווח של הגדוד (כמה ימים קדימה בכל יום בשבוע) + חריגת תאריך (חגים).
 * ברירת מחדל: היום בלבד (fwd=0).
 */
export async function maxReportableDate(battalionId: string, todayIL: string): Promise<string> {
  const today = new Date(todayIL + "T00:00:00Z");
  const dow = today.getUTCDay(); // 0=ראשון .. 6=שבת
  const bat = await prisma.battalion.findUnique({
    where: { id: battalionId },
    select: { attendanceReportWindowDow: true },
  });
  const arr = Array.isArray(bat?.attendanceReportWindowDow) ? (bat!.attendanceReportWindowDow as unknown[]) : [];
  let fwd = Math.max(0, Number(arr[dow] ?? 0) || 0);
  const ov = await prisma.attendanceReportOverride
    .findUnique({ where: { battalionId_date: { battalionId, date: today } }, select: { daysForward: true } })
    .catch(() => null);
  if (ov && ov.daysForward > fwd) fwd = ov.daysForward;
  return new Date(today.getTime() + fwd * 86400000).toISOString().slice(0, 10);
}
