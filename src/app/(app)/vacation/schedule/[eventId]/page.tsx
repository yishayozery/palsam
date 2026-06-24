import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import Link from "next/link";
import EventClient from "./EventClient";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const user = await requireUser();
  const bId = user.battalionId!;

  const event = await prisma.scheduleEvent.findUnique({
    where: { id: eventId },
    include: {
      forces: {
        include: {
          user: { select: { id: true, fullName: true, title: true } },
          dayEntries: {
            include: {
              soldiers: {
                include: { soldier: { select: { id: true, fullName: true, personalNumber: true, company: { select: { name: true } } } } },
              },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!event || event.battalionId !== bId || !event.active) notFound();

  const allUsers = await prisma.appUser.findMany({
    where: { battalionId: bId, active: true },
    select: { id: true, fullName: true, title: true },
    orderBy: { fullName: "asc" },
  });

  const soldiers = await prisma.soldier.findMany({
    where: { battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] } },
    select: {
      id: true,
      fullName: true,
      personalNumber: true,
      companyId: true,
      company: { select: { name: true } },
    },
    orderBy: { fullName: "asc" },
  });

  const companies = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "COMPANY", active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const typeLabel = event.type === "PLUGATI" ? "לוז פלוגתי" : "מקדים/מאסף";
  const backHref = `/vacation/schedule?type=${event.type}`;

  // build dates array
  const dates: string[] = [];
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }

  return (
    <div>
      <PageHeader
        title={`${event.name}`}
        subtitle={`${typeLabel} · ${dates.length} ימים`}
        action={<Link href={backHref} className="text-sm text-blue-600 hover:underline">← חזרה לרשימה</Link>}
      />
      <EventClient
        eventId={event.id}
        eventName={event.name}
        eventType={event.type}
        startDate={event.startDate.toISOString().slice(0, 10)}
        endDate={event.endDate.toISOString().slice(0, 10)}
        notes={event.notes}
        createdById={event.createdById}
        currentUserId={user.id}
        isAdmin={user.isAdmin}
        dates={dates}
        forces={event.forces.map((f) => ({
          id: f.id,
          userId: f.userId,
          userName: f.user.fullName,
          userTitle: f.user.title,
          forceName: f.forceName,
          dayEntries: Object.fromEntries(
            f.dayEntries.map((de) => [
              de.date.toISOString().slice(0, 10),
              {
                id: de.id,
                plannedTasks: de.plannedTasks,
                actualTasks: de.actualTasks,
                plannedNotes: de.plannedNotes,
                actualNotes: de.actualNotes,
                plannedSoldiers: de.soldiers
                  .filter((s) => s.phase === "planned")
                  .map((s) => ({ id: s.soldier.id, name: s.soldier.fullName, company: s.soldier.company?.name })),
                actualSoldiers: de.soldiers
                  .filter((s) => s.phase === "actual")
                  .map((s) => ({ id: s.soldier.id, name: s.soldier.fullName, company: s.soldier.company?.name })),
              },
            ])
          ),
        }))}
        allUsers={allUsers.map((u) => ({ id: u.id, fullName: u.fullName, title: u.title }))}
        soldiers={soldiers.map((s) => ({
          id: s.id,
          fullName: s.fullName,
          personalNumber: s.personalNumber,
          companyId: s.companyId,
          companyName: s.company?.name ?? null,
        }))}
        companies={companies}
      />
    </div>
  );
}
