import { requireUser } from "@/lib/guard";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import Link from "next/link";
import CreateBoardForm from "./CreateBoardForm";
import AssignUsersButton from "./AssignUsersButton";

export const dynamic = "force-dynamic";

export default async function VacationPage() {
  const user = await requireUser();
  const bId = user.battalionId!;
  const isAdmin = user.isAdmin;

  const boards = await prisma.vacationBoard.findMany({
    where: { battalionId: bId, active: true },
    include: {
      _count: { select: { assignees: true, entries: true } },
      assignees: { select: { userId: true } },
    },
    orderBy: { startDate: "desc" },
  });

  // משתמשים לניהול שיוך
  const allUsers = isAdmin
    ? await prisma.appUser.findMany({
        where: { battalionId: bId, active: true },
        select: { id: true, fullName: true, title: true },
        orderBy: { fullName: "asc" },
      })
    : [];

  // ללא אדמין — מראים רק לוחות שהמשתמש משויך אליהם
  const myBoards = isAdmin ? boards : boards.filter((b) => b.assignees.some((a) => a.userId === user.id));
  if (!isAdmin && myBoards.length === 1) redirect(`/vacation/${myBoards[0].id}`);

  const fmt = (d: Date) => d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div>
      <PageHeader
        title="🏖️ לוח זמינות"
        subtitle="תכנון חופשות וזמינות — כל מזומן מעדכן בעצמו"
      />

      {isAdmin && <CreateBoardForm />}

      {myBoards.length === 0 ? (
        <Card className="p-6">
          <EmptyState>
            {isAdmin
              ? "אין לוחות זמינות — לחץ על \"לוח חדש\" כדי להתחיל"
              : "אין לוחות זמינות שאתה משויך אליהם. פנה למנהל המערכת."}
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-3">
          {myBoards.map((b) => {
            const isAssigned = b.assignees.some((a) => a.userId === user.id);
            return (
              <Card key={b.id} className="p-4">
                <div className="flex items-center justify-between">
                  <Link href={`/vacation/${b.id}`} className="flex-1 hover:text-blue-600 transition">
                    <h3 className="font-bold text-lg">{b.name}</h3>
                    <div className="text-sm text-slate-500 mt-1 flex gap-4">
                      <span>{fmt(b.startDate)} — {fmt(b.endDate)}</span>
                      <span>{b._count.assignees} משתמשים</span>
                      <span>{b._count.entries} עדכונים</span>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2">
                    {isAssigned && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">משויך</span>
                    )}
                    {isAdmin && (
                      <AssignUsersButton
                        boardId={b.id}
                        allUsers={allUsers}
                        currentAssignees={b.assignees.map((a) => a.userId)}
                      />
                    )}
                    <Link
                      href={`/vacation/${b.id}`}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                    >
                      פתח
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
