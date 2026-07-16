import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyLink } from "@/lib/link-token";
import { maxReportableDate } from "@/lib/attendanceWindow";
import { readPresence } from "@/lib/attendancePresence";
import AttendanceReportClient from "./AttendanceReportClient";

export const dynamic = "force-dynamic";

function addDaysYmd(ymd: string, n: number): string {
  return new Date(new Date(ymd + "T00:00:00.000Z").getTime() + n * 86400000).toISOString().slice(0, 10);
}

export default async function AttendanceReportPage({ params, searchParams }: { params: Promise<{ soldierId: string }>; searchParams: Promise<{ t?: string; date?: string; mode?: string }> }) {
  const { soldierId } = await params;
  const { t: tok, date: dateParam, mode: modeParam } = await searchParams;
  if (!verifyLink("attendance-report", soldierId, tok)) notFound();
  const mode: "plan" | "record" = modeParam === "plan" ? "plan" : "record";

  const reporter = await prisma.soldier.findUnique({
    where: { id: soldierId },
    select: { id: true, fullName: true, battalionId: true, companyId: true, squadId: true, isAttendanceReporter: true, attendanceReporterAllCompany: true,
      appUser: { select: { role: true } }, company: { select: { name: true } }, squad: { select: { name: true } }, battalion: { select: { name: true } } },
  });
  if (!reporter) notFound();
  const canReport = reporter.isAttendanceReporter || reporter.appUser?.role === "COMPANY_REP";
  if (!canReport) notFound();

  // היקף: כל הפלוגה אם סומן allCompany (או אין מחלקה); אחרת המחלקה שלו
  const companyWide = reporter.attendanceReporterAllCompany || !reporter.squadId;
  const scopeWhere = companyWide ? { companyId: reporter.companyId } : { squadId: reporter.squadId };
  const todayIL = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const todayDate = new Date(todayIL + "T00:00:00.000Z");
  // 🎖️ מציגים רק חיילים ב-שמ"פ פעיל (בבסיס). גדוד שלא מנהל שמ"פ (אין תוצאות) → מציגים את כולם.
  let soldiers = await prisma.soldier.findMany({
    where: { battalionId: reporter.battalionId, status: { notIn: ["DISCHARGED", "INACTIVE"] }, ...scopeWhere,
      callupPeriods: { some: { startDate: { lte: todayDate }, OR: [{ endDate: null }, { endDate: { gte: todayDate } }] } } },
    select: { id: true, fullName: true, personalNumber: true, squad: { select: { name: true } } },
    orderBy: [{ squad: { name: "asc" } }, { fullName: "asc" }],
  });
  if (soldiers.length === 0) soldiers = await prisma.soldier.findMany({
    where: { battalionId: reporter.battalionId, status: { notIn: ["DISCHARGED", "INACTIVE"] }, ...scopeWhere },
    select: { id: true, fullName: true, personalNumber: true, squad: { select: { name: true } } },
    orderBy: [{ squad: { name: "asc" } }, { fullName: "asc" }],
  });
  const statuses = await prisma.attendanceStatus.findMany({
    where: { battalionId: reporter.battalionId, active: true },
    orderBy: { sortOrder: "asc" }, select: { id: true, name: true, icon: true, color: true, isPresent: true },
  });
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayIL;

  // חלון דיווח: ביצוע — עד התאריך המותר בגדוד להיום; תכנון — קדימה (עד שבועיים ב-chips).
  const maxDate = mode === "record" ? await maxReportableDate(reporter.battalionId, todayIL) : addDaysYmd(todayIL, 13);
  const windowDates: string[] = [];
  for (let d = todayIL; d <= maxDate && windowDates.length < 21; d = addDaysYmd(d, 1)) windowDates.push(d);
  // ודא שהתאריך הנבחר נמצא בחלון (למשל אם נבחר עבר בתכנון) — מוסיפים אם חסר
  if (!windowDates.includes(date)) windowDates.unshift(date);

  const sids = soldiers.map((s) => s.id);
  const dateObj = new Date(date + "T00:00:00.000Z");
  const yesterdayYmd = addDaysYmd(date, -1);
  const yObj = new Date(yesterdayYmd + "T00:00:00.000Z");
  const [records, plans, yesterday] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { date: dateObj, soldierId: { in: sids } }, select: { soldierId: true, statusId: true } }),
    prisma.attendancePlan.findMany({ where: { date: dateObj, soldierId: { in: sids } }, select: { soldierId: true, statusId: true } }),
    prisma.attendanceRecord.findMany({ where: { date: yObj, soldierId: { in: sids } }, select: { soldierId: true, statusId: true } }),
  ]);

  const scopeName = companyWide ? (reporter.company?.name ?? "הפלוגה") : (reporter.squad?.name ?? "המחלקה");
  // מצב נוכחות ראשוני — מי עוד פעיל על אותה קבוצה + מי דיווח לאחרונה (תיאום בין 2 נאמנים)
  const scopeKey = (companyWide ? reporter.companyId : reporter.squadId) ?? "";
  const presence = scopeKey ? await readPresence(scopeKey, dateObj, reporter.id) : { others: [], lastSubmit: null };
  return (
    <AttendanceReportClient
      soldierId={reporter.id}
      token={tok ?? ""}
      date={date}
      today={todayIL}
      mode={mode}
      windowDates={windowDates}
      scopeName={scopeName}
      battalionName={reporter.battalion?.name ?? ""}
      reporterName={reporter.fullName}
      soldiers={soldiers.map((s) => ({ id: s.id, name: s.fullName, pn: s.personalNumber, squad: s.squad?.name ?? null }))}
      statuses={statuses}
      records={records.map((r) => ({ soldierId: r.soldierId, statusId: r.statusId }))}
      plans={plans.map((r) => ({ soldierId: r.soldierId, statusId: r.statusId }))}
      yesterday={yesterday.map((r) => ({ soldierId: r.soldierId, statusId: r.statusId }))}
      presence={presence}
    />
  );
}
