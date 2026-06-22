import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import Link from "next/link";
import VacationCalendar from "./VacationCalendar";
import StatusManager from "./StatusManager";

export const dynamic = "force-dynamic";

export default async function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "reports.view")) redirect("/dashboard");
  const bId = user.battalionId!;
  const { boardId } = await params;

  const board = await prisma.vacationBoard.findUnique({
    where: { id: boardId },
    include: {
      assignees: {
        include: { user: { select: { id: true, fullName: true, title: true, role: true } } },
      },
    },
  });
  if (!board || board.battalionId !== bId || !board.active) redirect("/vacation");

  const statuses = await prisma.vacationStatus.findMany({
    where: { battalionId: bId, active: true },
    orderBy: { sortOrder: "asc" },
  });

  if (statuses.length === 0) {
    return (
      <div>
        <PageHeader title={board.name} subtitle="לוח זמינות" />
        <Card className="p-6">
          <EmptyState>אין סטטוסים מוגדרים. מפ&quot;מ צריך ליצור לוח חדש ליצירת סטטוסי ברירת מחדל.</EmptyState>
        </Card>
      </div>
    );
  }

  const entries = await prisma.vacationEntry.findMany({
    where: { boardId },
    select: { userId: true, date: true, statusId: true },
  });

  const isAdmin = can(user.role, "battalion.profile");
  const isAssigned = board.assignees.some((a) => a.user.id === user.id);

  const days: string[] = [];
  const d = new Date(board.startDate);
  const end = new Date(board.endDate);
  while (d <= end) {
    days.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }

  const entryMap: Record<string, Record<string, string>> = {};
  for (const e of entries) {
    const dateStr = e.date.toISOString().slice(0, 10);
    if (!entryMap[e.userId]) entryMap[e.userId] = {};
    entryMap[e.userId][dateStr] = e.statusId;
  }

  return (
    <div>
      <PageHeader
        title={board.name}
        subtitle={`${board.startDate.toLocaleDateString("he-IL")} — ${board.endDate.toLocaleDateString("he-IL")} · ${board.assignees.length} משתמשים`}
        action={<Link href="/vacation" className="text-sm text-blue-600 hover:underline">← חזרה</Link>}
      />

      {board.assignees.length === 0 ? (
        <Card className="p-6">
          <EmptyState>לא שויכו משתמשים ללוח. {isAdmin && "לחץ \"שיוך\" ברשימת הלוחות."}</EmptyState>
        </Card>
      ) : (
        <VacationCalendar
          boardId={boardId}
          days={days}
          users={board.assignees.map((a) => ({
            id: a.user.id,
            fullName: a.user.fullName,
            title: a.user.title,
          }))}
          statuses={statuses.map((s) => ({
            id: s.id,
            name: s.name,
            color: s.color,
            icon: s.icon,
          }))}
          entries={entryMap}
          currentUserId={user.id}
          isAdmin={isAdmin}
          isAssigned={isAssigned}
        />
      )}

      {isAdmin && (
        <div className="mt-4">
          <StatusManager statuses={statuses.map((s) => ({ id: s.id, name: s.name, color: s.color, icon: s.icon }))} />
        </div>
      )}
    </div>
  );
}
