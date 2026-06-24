import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import TabNav from "@/components/TabNav";
import ScheduleListClient from "./ScheduleListClient";
import type { ScheduleEventType } from "@/generated/prisma";

export const dynamic = "force-dynamic";

const SCHEDULE_TABS = [
  { key: "availability", label: "📅 זמינות", href: "/vacation" },
  { key: "mukdam", label: "🏕️ מקדים/מאסף", href: "/vacation/schedule?type=MUKDAM_MEASEF" },
  { key: "plugati", label: "📋 לוז פלוגתי", href: "/vacation/schedule?type=PLUGATI" },
];

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const params = await searchParams;
  const user = await requireUser();
  const bId = user.battalionId!;
  const type = (params.type === "PLUGATI" ? "PLUGATI" : "MUKDAM_MEASEF") as ScheduleEventType;
  const activeTab = type === "PLUGATI" ? "plugati" : "mukdam";

  const events = await prisma.scheduleEvent.findMany({
    where: { battalionId: bId, active: true, type },
    include: {
      _count: { select: { forces: true, dayEntries: true } },
      forces: {
        select: { userId: true, forceName: true, user: { select: { fullName: true } } },
      },
      approvers: {
        select: { userId: true, user: { select: { fullName: true } } },
      },
    },
    orderBy: { startDate: "desc" },
  });

  // non-admin users see only events they created, are a force of, or are an approver of
  const myEvents = user.isAdmin
    ? events
    : events.filter((e) =>
        e.createdById === user.id ||
        e.forces.some((f) => f.userId === user.id) ||
        e.approvers.some((a) => a.userId === user.id)
      );

  const allUsers = user.isAdmin
    ? await prisma.appUser.findMany({
        where: { battalionId: bId, active: true },
        select: { id: true, fullName: true, title: true },
        orderBy: { fullName: "asc" },
      })
    : [];

  const fmt = (d: Date) => d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div>
      <PageHeader
        title="📅 ניהול לוז"
        subtitle="זמינות, אירועי מקדים/מאסף ולוז פלוגתי"
      />
      <TabNav tabs={SCHEDULE_TABS} active={activeTab} />

      <ScheduleListClient
        events={myEvents.map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          startDate: e.startDate.toISOString().slice(0, 10),
          endDate: e.endDate.toISOString().slice(0, 10),
          startDateFmt: fmt(e.startDate),
          endDateFmt: fmt(e.endDate),
          forcesCount: e._count.forces,
          dayEntriesCount: e._count.dayEntries,
          forces: e.forces.map((f) => ({ forceName: f.forceName, userName: f.user.fullName })),
          approvers: e.approvers.map((a) => a.user.fullName),
          isCreator: e.createdById === user.id,
        }))}
        type={type}
        typeLabel={type === "PLUGATI" ? "לוז פלוגתי" : "מקדים/מאסף"}
        isAdmin={user.isAdmin}
        allUsers={allUsers}
      />
    </div>
  );
}
