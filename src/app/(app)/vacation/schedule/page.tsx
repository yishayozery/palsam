import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import TabNav from "@/components/TabNav";
import Link from "next/link";
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
    },
    orderBy: { startDate: "desc" },
  });

  const allUsers = user.isAdmin
    ? await prisma.appUser.findMany({
        where: { battalionId: bId, active: true },
        select: { id: true, fullName: true, title: true },
        orderBy: { fullName: "asc" },
      })
    : [];

  const fmt = (d: Date) => d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
  const typeLabel = type === "PLUGATI" ? "לוז פלוגתי" : "מקדים/מאסף";

  return (
    <div>
      <PageHeader
        title="📅 ניהול לוז"
        subtitle="זמינות, אירועי מקדים/מאסף ולוז פלוגתי"
      />
      <TabNav tabs={SCHEDULE_TABS} active={activeTab} />

      <ScheduleListClient
        events={events.map((e) => ({
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
        }))}
        type={type}
        typeLabel={typeLabel}
        isAdmin={user.isAdmin}
      />
    </div>
  );
}
