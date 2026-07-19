import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { resolveHolderKinds } from "@/lib/scope";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { getDaysForRange } from "@/lib/hebrew-dates";
import ForecastClient from "./ForecastClient";

export const dynamic = "force-dynamic";

export default async function AttendanceForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; days?: string }>;
}) {
  const user = await requireUser();
  const canManage = can(user, "attendance.manage");
  const canView = can(user, "attendance.view") || can(user, "employment");
  if (!canManage && !canView) redirect("/dashboard");
  const bId = user.battalionId!;
  const sp = await searchParams;

  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const startStr = /^\d{4}-\d{2}-\d{2}$/.test(sp.start ?? "") ? sp.start! : todayStr;
  const dayCount = Math.min(90, Math.max(7, parseInt(sp.days ?? "30", 10) || 30));
  const days = getDaysForRange(startStr, dayCount);
  const dateStrs = days.map((d) => d.date);

  // סקופ: מי שמשויך לפלוגה/מחלקה רואה רק אותה; מטה/שלישות — כל הגדוד
  const { companyHolderIds } = await resolveHolderKinds(user);
  const soldiers = await prisma.soldier.findMany({
    where: {
      battalionId: bId,
      status: { notIn: ["DISCHARGED", "INACTIVE"] },
      ...(companyHolderIds.length > 0 ? { companyId: { in: companyHolderIds } } : {}),
      ...(user.squadIds.length > 0 ? { squadId: { in: user.squadIds } } : {}),
    },
    orderBy: [{ company: { name: "asc" } }, { squad: { sortOrder: "asc" } }, { fullName: "asc" }],
    select: {
      id: true, fullName: true, personalNumber: true,
      company: { select: { id: true, name: true } },
      squad: { select: { id: true, name: true } },
    },
  });

  if (soldiers.length === 0) {
    return (
      <div>
        <PageHeader title="📅 תחזית הגעה" subtitle="כמה מגיעים בכל תאריך — לפי פלוגה ומחלקה" />
        <Card className="p-6"><EmptyState>אין חיילים בסקופ שלך.</EmptyState></Card>
      </div>
    );
  }

  const soldierIds = soldiers.map((s) => s.id);
  const [plans, statuses] = await Promise.all([
    prisma.attendancePlan.findMany({
      where: { soldierId: { in: soldierIds }, date: { in: dateStrs.map((d) => new Date(d + "T00:00:00Z")) } },
      select: { soldierId: true, date: true, statusId: true },
    }),
    prisma.attendanceStatus.findMany({
      where: { battalionId: bId, active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, icon: true, color: true, isPresent: true },
    }),
  ]);

  return (
    <ForecastClient
      startDate={startStr}
      dayCount={dayCount}
      days={days.map((d) => ({ date: d.date, dayLabel: d.dayLabel, gregDay: d.gregDay, gregMonth: d.gregMonth, isShabbat: d.isShabbat, isHoliday: d.isHoliday, holiday: d.holiday }))}
      soldiers={soldiers.map((s) => ({
        id: s.id, fullName: s.fullName, personalNumber: s.personalNumber,
        companyId: s.company?.id ?? "__none__", companyName: s.company?.name ?? "ללא פלוגה",
        squadId: s.squad?.id ?? "__none__", squadName: s.squad?.name ?? "ללא מחלקה",
      }))}
      plans={plans.map((p) => ({ soldierId: p.soldierId, date: p.date.toISOString().slice(0, 10), statusId: p.statusId }))}
      statuses={statuses}
      canManage={canManage}
    />
  );
}
