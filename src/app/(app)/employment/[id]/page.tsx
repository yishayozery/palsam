import { requireUser } from "@/lib/guard";
import { can, canEdit } from "@/lib/rbac";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, LinkButton } from "@/components/ui";
import AllocationEditor from "./AllocationEditor";

export const dynamic = "force-dynamic";

export default async function EmploymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const canManage = canEdit(user, "employment");
  const canView = can(user, "employment");
  if (!canManage && !canView) redirect("/dashboard");
  const bId = user.battalionId!;
  const { id } = await params;

  const employment = await prisma.employment.findUnique({
    where: { id },
    include: { allocations: true },
  });

  if (!employment || employment.battalionId !== bId || !employment.active) {
    notFound();
  }

  const companies = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "COMPANY", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const startDate = employment.startDate.toISOString().slice(0, 10);
  const endDate = employment.endDate.toISOString().slice(0, 10);

  const start = new Date(employment.startDate);
  const end = new Date(employment.endDate);
  const dayCount = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const dailyAverage = employment.mode === "total" ? Math.ceil(employment.totalDays / dayCount) : null;

  const dates: string[] = [];
  const d = new Date(start);
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }

  const allocationMap: Record<string, number> = {};
  for (const alloc of employment.allocations) {
    const key = `${alloc.companyId}_${alloc.date.toISOString().slice(0, 10)}`;
    allocationMap[key] = alloc.allocated;
  }

  return (
    <div>
      <PageHeader
        title={`📅 ${employment.name}`}
        subtitle={`${new Date(startDate).toLocaleDateString("he-IL")} - ${new Date(endDate).toLocaleDateString("he-IL")} | ${dayCount} ימים | ${employment.totalDays} ימי מילואים`}
        action={<LinkButton href="/attendance" variant="secondary">← חזרה לנוכחות</LinkButton>}
      />

      {dailyAverage !== null && (
        <div className="mb-4 p-3 bg-purple-50 rounded-lg border border-purple-200 text-sm text-purple-800">
          מצב סה״כ: ממוצע יומי מחושב = <strong>{dailyAverage}</strong> חיילים ליום
        </div>
      )}

      <AllocationEditor
        employmentId={employment.id}
        companies={companies}
        dates={dates}
        initialAllocations={allocationMap}
        dailyAverage={dailyAverage}
        totalDays={employment.totalDays}
        canManage={canManage}
      />
    </div>
  );
}
