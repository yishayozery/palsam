import { requireUser } from "@/lib/guard";
import { can, canEdit } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import EmploymentClient from "./EmploymentClient";
import EmploymentDashboard from "./EmploymentDashboard";

export const dynamic = "force-dynamic";

export default async function EmploymentPage() {
  const user = await requireUser();
  const canManage = canEdit(user, "employment");
  const canView = can(user, "employment");
  if (!canManage && !canView) redirect("/dashboard");
  const bId = user.battalionId!;

  const employments = await prisma.employment.findMany({
    where: { battalionId: bId, active: true },
    orderBy: { startDate: "desc" },
    include: { _count: { select: { allocations: true } } },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let dashboardData: {
    employment: (typeof employments)[0];
    allocations: { companyId: string; companyName: string; date: string; allocated: number }[];
    attendanceCounts: { companyId: string; date: string; count: number }[];
  }[] = [];

  for (const emp of employments) {
    const allocations = await prisma.employmentAllocation.findMany({
      where: { employmentId: emp.id },
      include: { company: { select: { name: true } } },
    });

    if (allocations.length === 0) continue;

    const startDate = new Date(emp.startDate);
    const endDateCapped = today < new Date(emp.endDate) ? today : new Date(emp.endDate);

    if (endDateCapped < startDate) {
      dashboardData.push({
        employment: emp,
        allocations: allocations.map((a) => ({
          companyId: a.companyId,
          companyName: a.company.name,
          date: a.date.toISOString().slice(0, 10),
          allocated: a.allocated,
        })),
        attendanceCounts: [],
      });
      continue;
    }

    const companyIds = [...new Set(allocations.map((a) => a.companyId))];

    const attendanceRecords = await prisma.attendanceRecord.findMany({
      where: {
        soldier: { companyId: { in: companyIds } },
        date: { gte: startDate, lte: endDateCapped },
        status: { isPresent: true },
      },
      select: { soldier: { select: { companyId: true } }, date: true },
    });

    const countMap = new Map<string, number>();
    for (const rec of attendanceRecords) {
      const key = `${rec.soldier.companyId}_${rec.date.toISOString().slice(0, 10)}`;
      countMap.set(key, (countMap.get(key) || 0) + 1);
    }

    dashboardData.push({
      employment: emp,
      allocations: allocations.map((a) => ({
        companyId: a.companyId,
        companyName: a.company.name,
        date: a.date.toISOString().slice(0, 10),
        allocated: a.allocated,
      })),
      attendanceCounts: Array.from(countMap.entries()).map(([key, count]) => {
        const [companyId, date] = key.split("_");
        return { companyId, date, count };
      }),
    });
  }

  const serialized = employments.map((e) => ({
    ...e,
    startDate: e.startDate.toISOString().slice(0, 10),
    endDate: e.endDate.toISOString().slice(0, 10),
    createdAt: e.createdAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader
        title="📅 תעסוקה"
        subtitle="תכנון אסטרטגי של ימי מילואים — הקצאת חיילים לפלוגות לפי ימים"
      />

      {dashboardData.length > 0 && (
        <div className="mb-6">
          <EmploymentDashboard
            data={dashboardData.map((d) => ({
              employmentName: d.employment.name,
              startDate: d.employment.startDate.toISOString().slice(0, 10),
              endDate: d.employment.endDate.toISOString().slice(0, 10),
              totalDays: d.employment.totalDays,
              allocations: d.allocations,
              attendanceCounts: d.attendanceCounts,
            }))}
          />
        </div>
      )}

      <EmploymentClient employments={serialized} canManage={canManage} />
    </div>
  );
}
