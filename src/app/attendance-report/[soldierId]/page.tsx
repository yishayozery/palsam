import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyLink } from "@/lib/link-token";
import AttendanceReportClient from "./AttendanceReportClient";

export const dynamic = "force-dynamic";

export default async function AttendanceReportPage({ params, searchParams }: { params: Promise<{ soldierId: string }>; searchParams: Promise<{ t?: string }> }) {
  const { soldierId } = await params;
  const { t: tok } = await searchParams;
  if (!verifyLink("attendance-report", soldierId, tok)) notFound();

  const reporter = await prisma.soldier.findUnique({
    where: { id: soldierId },
    select: { id: true, fullName: true, battalionId: true, companyId: true, squadId: true, isAttendanceReporter: true,
      appUser: { select: { role: true } }, company: { select: { name: true } }, squad: { select: { name: true } }, battalion: { select: { name: true } } },
  });
  if (!reporter) notFound();
  const canReport = reporter.isAttendanceReporter || reporter.appUser?.role === "COMPANY_REP";
  if (!canReport) notFound();

  const scopeWhere = reporter.squadId ? { squadId: reporter.squadId } : { companyId: reporter.companyId };
  const soldiers = await prisma.soldier.findMany({
    where: { battalionId: reporter.battalionId, status: { notIn: ["DISCHARGED", "INACTIVE"] }, ...scopeWhere },
    select: { id: true, fullName: true, personalNumber: true, squad: { select: { name: true } } },
    orderBy: [{ squad: { name: "asc" } }, { fullName: "asc" }],
  });
  const statuses = await prisma.attendanceStatus.findMany({
    where: { battalionId: reporter.battalionId, active: true },
    orderBy: { sortOrder: "asc" }, select: { id: true, name: true, icon: true, color: true, isPresent: true },
  });
  const todayIL = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const records = await prisma.attendanceRecord.findMany({
    where: { date: new Date(todayIL + "T00:00:00.000Z"), soldierId: { in: soldiers.map((s) => s.id) } },
    select: { soldierId: true, statusId: true },
  });

  const scopeName = reporter.squadId ? (reporter.squad?.name ?? "המחלקה") : (reporter.company?.name ?? "הפלוגה");
  return (
    <AttendanceReportClient
      soldierId={reporter.id}
      token={tok ?? ""}
      date={todayIL}
      scopeName={scopeName}
      battalionName={reporter.battalion?.name ?? ""}
      reporterName={reporter.fullName}
      soldiers={soldiers.map((s) => ({ id: s.id, name: s.fullName, pn: s.personalNumber, squad: s.squad?.name ?? null }))}
      statuses={statuses}
      records={records.map((r) => ({ soldierId: r.soldierId, statusId: r.statusId }))}
    />
  );
}
