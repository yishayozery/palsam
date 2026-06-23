import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import EmploymentClient from "./EmploymentClient";

export const dynamic = "force-dynamic";

export default async function EmploymentPage() {
  const user = await requireUser();
  const canManage = can(user, "attendance.manage");
  const canView = can(user, "attendance.view") || can(user, "employment");
  if (!canManage && !canView) redirect("/dashboard");
  const bId = user.battalionId!;

  const employments = await prisma.employment.findMany({
    where: { battalionId: bId, active: true },
    orderBy: { startDate: "desc" },
    include: { _count: { select: { allocations: true } } },
  });

  const data = employments.map((e) => ({
    id: e.id,
    name: e.name,
    startDate: e.startDate.toISOString().slice(0, 10),
    endDate: e.endDate.toISOString().slice(0, 10),
    totalDays: e.totalDays,
    mode: e.mode,
    _count: e._count,
  }));

  return (
    <div>
      <PageHeader title="📅 ניהול תעסוקות" subtitle="הגדרת תקופות תעסוקה והקצאות ימי מילואים" />
      <EmploymentClient employments={data} canManage={canManage} />
    </div>
  );
}
