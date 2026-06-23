import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, LinkButton } from "@/components/ui";
import DailyReportClient from "./DailyReportClient";

export const dynamic = "force-dynamic";

export default async function DailyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ employmentId?: string }>;
}) {
  const user = await requireUser();
  const canView = can(user, "attendance.view");
  if (!canView) redirect("/dashboard");
  const bId = user.battalionId!;
  const { employmentId } = await searchParams;

  if (!employmentId) redirect("/attendance");

  const employment = await prisma.employment.findUnique({
    where: { id: employmentId },
    include: {
      allocations: { include: { company: { select: { id: true, name: true } } } },
    },
  });

  if (!employment || employment.battalionId !== bId || !employment.active) {
    redirect("/attendance");
  }

  const companies = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "COMPANY", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Company scoping: מפ sees only their company
  let visibleCompanyIds: string[] | null = null;
  if (user.role === "COMPANY_REP" && user.holderId) {
    visibleCompanyIds = [user.holderId];
  } else if (!user.isAdmin && user.holderId) {
    const holder = await prisma.holder.findUnique({ where: { id: user.holderId }, select: { kind: true } });
    if (holder?.kind === "COMPANY") visibleCompanyIds = [user.holderId];
  }

  const startDate = employment.startDate;
  const endDate = employment.endDate;

  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates: string[] = [];
  const d = new Date(start);
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }

  // Allocations by company and date
  const allocMap = new Map<string, number>();
  for (const a of employment.allocations) {
    if (visibleCompanyIds && !visibleCompanyIds.includes(a.companyId)) continue;
    const key = `${a.companyId}_${a.date.toISOString().slice(0, 10)}`;
    allocMap.set(key, a.allocated);
  }

  // Attendance records
  const companyFilter = visibleCompanyIds ? { in: visibleCompanyIds } : undefined;
  const records = await prisma.attendanceRecord.findMany({
    where: {
      soldier: { battalionId: bId, ...(companyFilter ? { companyId: companyFilter } : {}) },
      date: { gte: startDate, lte: endDate },
      status: { isPresent: true },
    },
    select: { soldier: { select: { companyId: true } }, date: true },
  });

  const actualMap = new Map<string, number>();
  for (const r of records) {
    const key = `${r.soldier.companyId}_${r.date.toISOString().slice(0, 10)}`;
    actualMap.set(key, (actualMap.get(key) || 0) + 1);
  }

  const visibleCompanies = visibleCompanyIds
    ? companies.filter((c) => visibleCompanyIds!.includes(c.id))
    : companies;

  // Build report data
  const reportRows = dates.map((dt) => {
    let dayAlloc = 0;
    let dayActual = 0;
    const perCompany: { companyName: string; allocated: number; actual: number }[] = [];

    for (const co of visibleCompanies) {
      const alloc = allocMap.get(`${co.id}_${dt}`) || 0;
      const actual = actualMap.get(`${co.id}_${dt}`) || 0;
      dayAlloc += alloc;
      dayActual += actual;
      perCompany.push({ companyName: co.name, allocated: alloc, actual });
    }

    return { date: dt, allocated: dayAlloc, actual: dayActual, perCompany };
  });

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    <div>
      <PageHeader
        title={`📊 דוח הצלבה יומי — ${employment.name}`}
        subtitle={`${start.toLocaleDateString("he-IL")} — ${end.toLocaleDateString("he-IL")} | ${employment.totalDays} ימי מילואים`}
        action={
          <LinkButton href={`/attendance?employmentId=${employment.id}`} variant="secondary">
            ← חזרה לנוכחות
          </LinkButton>
        }
      />
      <DailyReportClient
        employmentName={employment.name}
        totalDays={employment.totalDays}
        rows={reportRows}
        companies={visibleCompanies.map((c) => c.name)}
        today={todayStr}
      />
    </div>
  );
}
