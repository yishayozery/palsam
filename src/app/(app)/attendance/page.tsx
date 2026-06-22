import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { getDaysForRange } from "@/lib/hebrew-dates";
import AttendanceClient from "./AttendanceClient";

export const dynamic = "force-dynamic";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string; start?: string; mode?: string }>;
}) {
  const user = await requireUser();
  const canManage = can(user, "attendance.manage");
  const canView = can(user, "attendance.view");
  if (!canManage && !canView) redirect("/dashboard");
  const bId = user.battalionId!;
  const sp = await searchParams;

  const companies = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "COMPANY", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (companies.length === 0) {
    return (
      <div>
        <PageHeader title="📋 נוכחות חיילים" subtitle="תוכנית עבודה וביצוע בפועל" />
        <Card className="p-6"><EmptyState>אין פלוגות פעילות.</EmptyState></Card>
      </div>
    );
  }

  // COMPANY_REP sees only their company; squad-scoped users see only relevant companies
  let availableCompanies = companies;
  if (user.role === "COMPANY_REP" && user.holderId) {
    availableCompanies = companies.filter((c) => c.id === user.holderId);
  } else if (user.squadIds.length > 0) {
    const squadCompanyIds = await prisma.squad.findMany({
      where: { id: { in: user.squadIds } },
      select: { companyId: true },
    });
    const companyIdSet = new Set(squadCompanyIds.map((s) => s.companyId));
    availableCompanies = companies.filter((c) => companyIdSet.has(c.id));
  }

  const selectedCompanyId = sp.companyId === "__all__"
    ? "__all__"
    : sp.companyId && availableCompanies.some((c) => c.id === sp.companyId)
      ? sp.companyId
      : availableCompanies[0]?.id;

  if (!selectedCompanyId) redirect("/dashboard");

  // Date range: start from today, 35 days forward
  const today = new Date();
  const startStr = sp.start || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const days = getDaysForRange(startStr, 35);

  const mode = (sp.mode === "record" ? "record" : "plan") as "plan" | "record";

  const isAll = selectedCompanyId === "__all__";

  // Fetch soldiers
  const squadFilter = user.squadIds.length > 0 ? { squadId: { in: user.squadIds } } : {};
  const soldiers = await prisma.soldier.findMany({
    where: {
      battalionId: bId,
      ...(isAll ? {} : { companyId: selectedCompanyId }),
      status: { notIn: ["DISCHARGED", "INACTIVE"] },
      ...squadFilter,
    },
    orderBy: [{ company: { name: "asc" } }, { squad: { sortOrder: "asc" } }, { fullName: "asc" }],
    select: {
      id: true,
      fullName: true,
      personalNumber: true,
      squadId: true,
      squad: { select: { name: true } },
      companyRoleId: true,
      companyRole: { select: { name: true, isCommander: true } },
      enlistedAt: true,
      callupClosedAt: true,
      companyId: true,
      company: { select: { name: true } },
    },
  });

  // Fetch squads & company roles
  const [squads, companyRoles] = await Promise.all([
    prisma.squad.findMany({
      where: {
        ...(isAll
          ? { company: { battalionId: bId }, active: true }
          : { companyId: selectedCompanyId, active: true }),
        ...(user.squadIds.length > 0 ? { id: { in: user.squadIds } } : {}),
      },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.companyRole.findMany({
      where: { battalionId: bId, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, isCommander: true },
    }),
  ]);

  // Fetch statuses
  const rawStatuses = await prisma.attendanceStatus.findMany({
    where: { battalionId: bId, active: true },
    orderBy: { sortOrder: "asc" },
  });
  const NAME_ICON_FALLBACK: Record<string, string> = {
    "יום יציאה": "➡️", "יציאה": "➡️",
    "יום חזרה": "⬅️", "חזרה": "⬅️", "יום הגעה": "⬅️",
    "נוכח": "✅", "חופש סבב": "🔄", "מחלה": "🏥", "קורס": "📚",
    "חופשה": "🏖️", "ג׳ובניק": "🔒",
  };
  const statuses = rawStatuses.map((s) => ({
    ...s,
    icon: s.icon || NAME_ICON_FALLBACK[s.name] || null,
  }));

  if (statuses.length === 0) {
    return (
      <div>
        <PageHeader title="📋 נוכחות חיילים" subtitle="תוכנית עבודה וביצוע בפועל" />
        <Card className="p-6">
          <EmptyState>
            לא הוגדרו סטטוסי נוכחות. <a href="/attendance-settings" className="text-blue-600 underline">הגדר סטטוסים</a> כדי להתחיל.
          </EmptyState>
        </Card>
      </div>
    );
  }

  // Fetch attendance data for the date range
  const startDate = new Date(startStr + "T00:00:00Z");
  const endDate = new Date(startStr + "T00:00:00Z");
  endDate.setDate(endDate.getDate() + 35);
  const soldierIds = soldiers.map((s) => s.id);

  const plans = await prisma.attendancePlan.findMany({
    where: { soldierId: { in: soldierIds }, date: { gte: startDate, lt: endDate } },
    select: { soldierId: true, date: true, statusId: true },
  });

  const records = await prisma.attendanceRecord.findMany({
    where: { soldierId: { in: soldierIds }, date: { gte: startDate, lt: endDate } },
    select: { soldierId: true, date: true, statusId: true },
  });

  // Serialize dates
  const planData = plans.map((p) => ({
    soldierId: p.soldierId,
    date: p.date.toISOString().slice(0, 10),
    statusId: p.statusId,
  }));
  const recordData = records.map((r) => ({
    soldierId: r.soldierId,
    date: r.date.toISOString().slice(0, 10),
    statusId: r.statusId,
  }));

  return (
    <div>
      <PageHeader
        title="📋 נוכחות חיילים"
        subtitle={mode === "plan" ? "תוכנית עבודה — תכנון נוכחות קדימה" : "ביצוע בפועל — נוכחות אמיתית"}
      />
      <AttendanceClient
        companies={availableCompanies}
        selectedCompanyId={selectedCompanyId}
        soldiers={soldiers.map((s) => ({
          id: s.id,
          fullName: s.fullName,
          personalNumber: s.personalNumber,
          companyId: s.companyId,
          companyName: s.company?.name ?? null,
          squadId: s.squadId,
          squadName: s.squad?.name ?? null,
          companyRoleId: s.companyRoleId,
          companyRoleName: s.companyRole?.name ?? null,
          isCommander: s.companyRole?.isCommander ?? false,
          enlistedAt: s.enlistedAt?.toISOString().slice(0, 10) ?? null,
          callupClosedAt: s.callupClosedAt?.toISOString().slice(0, 10) ?? null,
        }))}
        squads={squads}
        companyRoles={companyRoles}
        statuses={statuses}
        days={days}
        plans={planData}
        records={recordData}
        mode={mode}
        canManage={canManage}
        startDate={startStr}
      />
    </div>
  );
}
