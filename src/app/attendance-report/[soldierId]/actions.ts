"use server";

import { prisma } from "@/lib/prisma";
import { verifyLink } from "@/lib/link-token";
import { revalidatePath } from "next/cache";

/** דיווח נוכחות ע"י נאמן כ"א דרך לינק ציבורי מאובטח (ללא התחברות). */
export async function submitAttendanceReport(
  soldierId: string, token: string, date: string,
  entries: { soldierId: string; statusId: string | null }[],
): Promise<{ ok?: boolean; error?: string; count?: number }> {
  if (!verifyLink("attendance-report", soldierId, token)) return { error: "קישור לא תקין" };
  const reporter = await prisma.soldier.findUnique({
    where: { id: soldierId },
    select: { battalionId: true, companyId: true, squadId: true, isAttendanceReporter: true, appUser: { select: { id: true, role: true } } },
  });
  if (!reporter) return { error: "לא נמצא" };
  const canReport = reporter.isAttendanceReporter || reporter.appUser?.role === "COMPANY_REP";
  if (!canReport) return { error: "אין לך הרשאת דיווח נוכחות" };

  // חלון דיווח — לא מעבר למותר
  const todayIL = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const { maxReportableDate } = await import("@/lib/attendanceWindow");
  const maxDate = await maxReportableDate(reporter.battalionId, todayIL);
  if (date > maxDate) return { error: `לא ניתן לדווח מעבר לחלון המותר (עד ${maxDate})` };

  // היקף — המחלקה של הנאמן אם משויך, אחרת כל הפלוגה
  const scopeWhere = reporter.squadId ? { squadId: reporter.squadId } : { companyId: reporter.companyId };
  const allowed = new Set((await prisma.soldier.findMany({
    where: { battalionId: reporter.battalionId, status: { notIn: ["DISCHARGED", "INACTIVE"] }, ...scopeWhere },
    select: { id: true },
  })).map((s) => s.id));

  const dateObj = new Date(date + "T00:00:00.000Z");
  const upBy = reporter.appUser?.id ?? null;
  let count = 0;
  for (const e of entries) {
    if (!allowed.has(e.soldierId)) continue;
    if (e.statusId) {
      await prisma.attendanceRecord.upsert({
        where: { soldierId_date: { soldierId: e.soldierId, date: dateObj } },
        update: { statusId: e.statusId, updatedById: upBy },
        create: { soldierId: e.soldierId, date: dateObj, statusId: e.statusId, updatedById: upBy },
      });
      count++;
    } else {
      await prisma.attendanceRecord.deleteMany({ where: { soldierId: e.soldierId, date: dateObj } });
    }
  }
  revalidatePath("/attendance");
  return { ok: true, count };
}
