import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { resolveHolderKinds } from "@/lib/scope";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { getDaysForRange } from "@/lib/hebrew-dates";
import ForecastClient from "./ForecastClient";

export const dynamic = "force-dynamic";

const ONE_DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function AttendanceForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ employmentId?: string; start?: string; days?: string }>;
}) {
  const user = await requireUser();
  const canManage = can(user, "attendance.manage");
  const canView = can(user, "attendance.view") || can(user, "employment");
  if (!canManage && !canView) redirect("/dashboard");
  const bId = user.battalionId!;
  const sp = await searchParams;

  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());

  // ── הציר נמתח על התעסוקה. ברירת מחדל: התעסוקה הפעילה/הקרובה ──
  const employments = await prisma.employment.findMany({
    where: { battalionId: bId },
    orderBy: [{ active: "desc" }, { startDate: "desc" }],
    select: { id: true, name: true, startDate: true, endDate: true, active: true, totalDays: true },
  });
  const selectedEmp = sp.employmentId
    ? employments.find((e) => e.id === sp.employmentId) ?? null
    : employments.find((e) => iso(e.startDate) <= todayStr && iso(e.endDate) >= todayStr)
      ?? employments.find((e) => iso(e.startDate) > todayStr) // התעסוקה הבאה — זה שלב הצווים
      ?? employments[0] ?? null;

  let startStr: string, dayCount: number;
  if (selectedEmp) {
    startStr = iso(selectedEmp.startDate);
    dayCount = Math.min(120, Math.round((selectedEmp.endDate.getTime() - selectedEmp.startDate.getTime()) / ONE_DAY) + 1);
  } else {
    startStr = /^\d{4}-\d{2}-\d{2}$/.test(sp.start ?? "") ? sp.start! : todayStr;
    dayCount = Math.min(120, Math.max(7, parseInt(sp.days ?? "30", 10) || 30));
  }
  const days = getDaysForRange(startStr, dayCount);
  const dateObjs = days.map((d) => new Date(d.date + "T00:00:00Z"));

  // סקופ: פלוגה/מחלקה של המשתמש; מטה/שלישות — כל הגדוד
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

  const statuses = await prisma.forecastStatus.findMany({
    where: { battalionId: bId, active: true },
    orderBy: [{ inService: "desc" }, { sortOrder: "asc" }],
    select: { id: true, name: true, icon: true, color: true, inService: true },
  });

  if (soldiers.length === 0) {
    return (
      <div>
        <PageHeader title="📅 תחזית הגעה" subtitle="שלב הצווים — מי מגיע לתעסוקה ומתי" />
        <Card className="p-6"><EmptyState>אין חיילים בסקופ שלך.</EmptyState></Card>
      </div>
    );
  }
  if (statuses.length === 0) {
    return (
      <div>
        <PageHeader title="📅 תחזית הגעה" subtitle="שלב הצווים — מי מגיע לתעסוקה ומתי" />
        <Card className="p-6"><EmptyState>
          לא הוגדרו סטטוסי תחזית לגדוד. יש להגדיר אותם בהגדרות הנוכחות (טאב ״תחזית״).
        </EmptyState></Card>
      </div>
    );
  }

  const soldierIds = soldiers.map((s) => s.id);
  const [entries, orders, allocations] = await Promise.all([
    prisma.forecastEntry.findMany({
      where: { soldierId: { in: soldierIds }, date: { in: dateObjs } },
      select: { soldierId: true, date: true, statusId: true },
    }),
    selectedEmp
      ? prisma.forecastOrder.findMany({
          where: { employmentId: selectedEmp.id, soldierId: { in: soldierIds } },
          select: { soldierId: true, startDate: true, endDate: true },
        })
      : Promise.resolve([]),
    selectedEmp
      ? prisma.employmentAllocation.findMany({
          where: { employmentId: selectedEmp.id, date: { in: dateObjs } },
          select: { companyId: true, date: true, allocated: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <ForecastClient
      employments={employments.map((e) => ({ id: e.id, name: e.name, startDate: iso(e.startDate), endDate: iso(e.endDate), active: e.active }))}
      selectedEmploymentId={selectedEmp?.id ?? null}
      startDate={startStr}
      dayCount={dayCount}
      days={days.map((d) => ({ date: d.date, dayLabel: d.dayLabel, gregDay: d.gregDay, gregMonth: d.gregMonth, isShabbat: d.isShabbat, isHoliday: d.isHoliday, holiday: d.holiday }))}
      soldiers={soldiers.map((s) => ({
        id: s.id, fullName: s.fullName, personalNumber: s.personalNumber,
        companyId: s.company?.id ?? "__none__", companyName: s.company?.name ?? "ללא פלוגה",
        squadId: s.squad?.id ?? "__none__", squadName: s.squad?.name ?? "ללא מחלקה",
      }))}
      entries={entries.map((e) => ({ soldierId: e.soldierId, date: iso(e.date), statusId: e.statusId }))}
      orders={orders.map((o) => ({ soldierId: o.soldierId, startDate: iso(o.startDate), endDate: iso(o.endDate) }))}
      statuses={statuses}
      allocations={allocations.map((a) => ({ companyId: a.companyId, date: iso(a.date), allocated: a.allocated }))}
      canManage={canManage}
    />
  );
}
