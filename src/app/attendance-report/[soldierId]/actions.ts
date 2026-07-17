"use server";

import { prisma } from "@/lib/prisma";
import { verifyLink } from "@/lib/link-token";
import { touchPresence, readPresence, type PresenceState } from "@/lib/attendancePresence";
import { revalidatePath } from "next/cache";

/** scope + פרטי הנאמן, אחרי אימות הרשאה. null אם אין הרשאה. */
async function reporterScope(soldierId: string) {
  const r = await prisma.soldier.findUnique({
    where: { id: soldierId },
    select: { fullName: true, battalionId: true, companyId: true, squadId: true, isAttendanceReporter: true, appUser: { select: { role: true } } },
  });
  if (!r) return null;
  if (!(r.isAttendanceReporter || r.appUser?.role === "COMPANY_REP")) return null;
  const scopeKey = r.squadId ?? r.companyId ?? "";
  if (!scopeKey) return null;
  return { name: r.fullName, battalionId: r.battalionId, scopeKey };
}

/** heartbeat — מסמן שהנאמן פעיל, ומחזיר מי עוד פעיל + מי דיווח לאחרונה (לתיאום בין 2 נאמנים). */
export async function heartbeatPresence(
  soldierId: string, token: string, date: string, submitted = false,
): Promise<PresenceState> {
  const empty: PresenceState = { others: [], lastSubmit: null };
  if (!verifyLink("attendance-report", soldierId, token)) return empty;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return empty;
  const sc = await reporterScope(soldierId);
  if (!sc) return empty;
  const dateObj = new Date(date + "T00:00:00.000Z");
  await touchPresence({ ...sc, reporterId: soldierId, reporterName: sc.name, date: dateObj, submitted });
  return readPresence(sc.scopeKey, dateObj, soldierId);
}

/** דיווח/תכנון נוכחות ע"י נאמן כ"א דרך לינק ציבורי מאובטח (ללא התחברות).
 *  תומך בריבוי ימים — אותו סימון נכתב לכל התאריכים שנבחרו (למשל בחמישי → שישי+שבת). */
export async function submitAttendanceReport(
  soldierId: string, token: string, dates: string[], type: "plan" | "record",
  entries: { soldierId: string; statusId: string | null }[],
): Promise<{ ok?: boolean; error?: string; count?: number; days?: number }> {
  if (!verifyLink("attendance-report", soldierId, token)) return { error: "קישור לא תקין" };
  const reporter = await prisma.soldier.findUnique({
    where: { id: soldierId },
    select: { battalionId: true, companyId: true, squadId: true, isAttendanceReporter: true, attendanceReporterAllCompany: true, appUser: { select: { id: true, role: true } } },
  });
  if (!reporter) return { error: "לא נמצא" };
  const canReport = reporter.isAttendanceReporter || reporter.appUser?.role === "COMPANY_REP";
  if (!canReport) return { error: "אין לך הרשאת דיווח נוכחות" };

  const cleanDates = [...new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
  if (cleanDates.length === 0) return { error: "לא נבחר תאריך" };

  const todayIL = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  // דיווח בפועל — עד לחלון המותר; תכנון — קדימה בלבד
  if (type === "record") {
    const { maxReportableDate } = await import("@/lib/attendanceWindow");
    const maxDate = await maxReportableDate(reporter.battalionId, todayIL);
    const bad = cleanDates.find((d) => d > maxDate);
    if (bad) return { error: `דיווח בפועל — לא ניתן מעבר לחלון המותר (עד ${maxDate})` };
  } else {
    const bad = cleanDates.find((d) => d < todayIL);
    if (bad) return { error: "תכנון הוא קדימה בלבד (מהיום והלאה)" };
  }

  // היקף — כל הפלוגה אם סומן allCompany (או אין מחלקה); אחרת המחלקה של הנאמן.
  //   ⚠️ חייב להתאים לעמוד (companyWide) — אחרת חיילים מחוץ למחלקה נזרקים בשמירה.
  const companyWide = reporter.attendanceReporterAllCompany || !reporter.squadId;
  // 🔒 סקופ-מחלקה מצטלב עם פלוגת הנאמן — מונע שמירת נוכחות לחיילי פלוגה אחרת (דליפה חוצת-פלוגה)
  const scopeWhere = companyWide
    ? { companyId: reporter.companyId }
    : { squadId: reporter.squadId, ...(reporter.companyId ? { companyId: reporter.companyId } : {}) };
  const allowed = new Set((await prisma.soldier.findMany({
    where: { battalionId: reporter.battalionId, status: { notIn: ["DISCHARGED", "INACTIVE"] }, ...scopeWhere },
    select: { id: true },
  })).map((s) => s.id));

  const upBy = reporter.appUser?.id ?? null;
  let count = 0;
  for (const ymd of cleanDates) {
    const dateObj = new Date(ymd + "T00:00:00.000Z");
    for (const e of entries) {
      if (!allowed.has(e.soldierId)) continue;
      if (type === "plan") {
        if (e.statusId) { await prisma.attendancePlan.upsert({ where: { soldierId_date: { soldierId: e.soldierId, date: dateObj } }, update: { statusId: e.statusId, updatedById: upBy }, create: { soldierId: e.soldierId, date: dateObj, statusId: e.statusId, updatedById: upBy } }); count++; }
        else await prisma.attendancePlan.deleteMany({ where: { soldierId: e.soldierId, date: dateObj } });
      } else {
        if (e.statusId) { await prisma.attendanceRecord.upsert({ where: { soldierId_date: { soldierId: e.soldierId, date: dateObj } }, update: { statusId: e.statusId, updatedById: upBy }, create: { soldierId: e.soldierId, date: dateObj, statusId: e.statusId, updatedById: upBy } }); count++; }
        else await prisma.attendanceRecord.deleteMany({ where: { soldierId: e.soldierId, date: dateObj } });
      }
    }
  }
  revalidatePath("/attendance");
  return { ok: true, count, days: cleanDates.length };
}
