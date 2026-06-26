import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import TabNav from "@/components/TabNav";
import ScheduleListClient from "./ScheduleListClient";
import MyScheduleView from "./MyScheduleView";
import type { ScheduleEventType } from "@/generated/prisma";

export const dynamic = "force-dynamic";

const SCHEDULE_TABS = [
  { key: "my", label: "📋 הלוז שלי", href: "/vacation/schedule?type=MY" },
  { key: "availability", label: "📅 זמינות", href: "/vacation" },
  { key: "mukdam", label: "🏕️ מקדים/מאסף", href: "/vacation/schedule?type=MUKDAM_MEASEF" },
  { key: "plugati", label: "📋 לוז מפורט יומי", href: "/vacation/schedule?type=PLUGATI" },
];

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const params = await searchParams;
  const user = await requireUser();
  const bId = user.battalionId!;
  const isMy = params.type === "MY";
  const type = isMy ? undefined : (params.type === "PLUGATI" ? "PLUGATI" : "MUKDAM_MEASEF") as ScheduleEventType | undefined;
  const activeTab = isMy ? "my" : (type === "PLUGATI" ? "plugati" : "mukdam");

  const events = await prisma.scheduleEvent.findMany({
    where: { battalionId: bId, active: true, ...(type ? { type } : {}) },
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

  // "הלוז שלי" — only events where user is force/approver/creator
  // Other tabs — admin sees all, non-admin sees own
  const myEvents = isMy
    ? events.filter((e) =>
        e.createdById === user.id ||
        e.forces.some((f) => f.userId === user.id) ||
        e.approvers.some((a) => a.userId === user.id)
      )
    : user.isAdmin
      ? events
      : events.filter((e) =>
          e.createdById === user.id ||
          e.forces.some((f) => f.userId === user.id) ||
          e.approvers.some((a) => a.userId === user.id)
        );

  const allUsers = (user.isAdmin && !isMy)
    ? await prisma.appUser.findMany({
        where: { battalionId: bId, active: true },
        select: { id: true, fullName: true, title: true },
        orderBy: { fullName: "asc" },
      })
    : [];

  const fmt = (d: Date) => d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });

  // For "הלוז שלי" — fetch user's day entries with tasks for a unified view
  let myDayEntries: { eventName: string; eventType: string; forceName: string; date: string; dateFmt: string; dayName: string; plannedTasks: string | null; actualTasks: string | null; approved: boolean; soldierCount: number }[] = [];
  if (isMy) {
    const forces = await prisma.scheduleForce.findMany({
      where: { userId: user.id, event: { battalionId: bId, active: true } },
      include: {
        event: { select: { name: true, type: true } },
        dayEntries: {
          include: { _count: { select: { soldiers: true } } },
          orderBy: { date: "asc" },
        },
      },
    });
    const dayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
    for (const f of forces) {
      for (const de of f.dayEntries) {
        const dt = new Date(de.date);
        myDayEntries.push({
          eventName: f.event.name,
          eventType: f.event.type,
          forceName: f.forceName,
          date: de.date.toISOString().slice(0, 10),
          dateFmt: fmt(de.date),
          dayName: `יום ${dayNames[dt.getDay()]}`,
          plannedTasks: de.plannedTasks,
          actualTasks: de.actualTasks,
          approved: de.approved,
          soldierCount: de._count.soldiers,
        });
      }
    }
    myDayEntries.sort((a, b) => a.date.localeCompare(b.date));
  }

  return (
    <div>
      <PageHeader
        title="📅 ניהול לוז"
        subtitle="זמינות, אירועי מקדים/מאסף ולוז מפורט יומי"
      />
      <TabNav tabs={SCHEDULE_TABS} active={activeTab} />

      {isMy ? (
        <MyScheduleView entries={myDayEntries} events={myEvents.map((e) => ({
          id: e.id, name: e.name, type: e.type,
          startDateFmt: fmt(e.startDate), endDateFmt: fmt(e.endDate),
        }))} />
      ) : (
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
          type={type ?? "MUKDAM_MEASEF"}
          typeLabel={type === "PLUGATI" ? "לוז מפורט יומי" : "מקדים/מאסף"}
          isAdmin={user.isAdmin}
          allUsers={allUsers}
        />
      )}
    </div>
  );
}
