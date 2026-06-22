import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, EmptyState, Table, Th, Td } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_LABEL = {
  PENDING: "פתוח", IN_PROGRESS: "בביצוע", COMPLETED: "הושלם", OVERDUE: "באיחור", SCHEDULED: "עתידי", CANCELED: "בוטל",
} as const;
const STATUS_CLASS = {
  PENDING: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  OVERDUE: "bg-rose-100 text-rose-800",
  SCHEDULED: "bg-slate-100 text-slate-700",
  CANCELED: "bg-slate-100 text-slate-500",
} as const;

export default async function CountPlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const plan = await prisma.countPlan.findUnique({
    where: { id },
    include: {
      createdBy: { select: { fullName: true } },
      responsibleUser: { select: { id: true, fullName: true } },
      tasks: {
        include: {
          holder: { select: { name: true, kind: true } },
          assignedUser: { select: { fullName: true } },
          session: { include: { _count: { select: { lines: true, discrepancies: true } } } },
        },
        orderBy: [{ status: "asc" }, { scheduledAt: "desc" }],
      },
    },
  });
  if (!plan || plan.battalionId !== user.battalionId) notFound();

  // הרשאה: רק createdBy, responsibleUser, או מפ"מ יכולים לראות
  const isAuthorized = user.isAdmin || plan.createdById === user.id || plan.responsibleUserId === user.id;
  if (!isAuthorized) notFound();

  const stats = {
    total: plan.tasks.length,
    completed: plan.tasks.filter((t) => t.status === "COMPLETED").length,
    inProgress: plan.tasks.filter((t) => t.status === "IN_PROGRESS").length,
    overdue: plan.tasks.filter((t) => t.status === "OVERDUE").length,
    pending: plan.tasks.filter((t) => t.status === "PENDING").length,
    totalGaps: plan.tasks.reduce((s, t) => s + (t.session?._count.discrepancies ?? 0), 0),
  };

  const shareText = encodeURIComponent(
    `דוח ספירה — ${plan.name}\nהושלמו: ${stats.completed}/${stats.total}\nבאיחור: ${stats.overdue}\nפערים: ${stats.totalGaps}\n\nדוח Excel מצורף`
  );

  return (
    <div>
      <PageHeader
        title={`📋 ${plan.name}`}
        subtitle={`אחראי: ${plan.responsibleUser?.fullName ?? plan.createdBy.fullName} · נוצרה ע״י: ${plan.createdBy.fullName}`}
        action={
          <div className="flex gap-2 flex-wrap">
            <Link href="/counts/plans" className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">
              → חזרה
            </Link>
            <a href={`/counts/plans/${plan.id}/export`}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium">
              ⬇ ייצא Excel
            </a>
            <a href={`https://wa.me/?text=${shareText}`} target="_blank" rel="noreferrer"
              className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-medium">
              📱 שתף ב-WhatsApp
            </a>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Card className="p-3"><div className="text-xs text-slate-500">סה״כ משימות</div><div className="text-2xl font-bold mt-1">{stats.total}</div></Card>
        <Card className="p-3"><div className="text-xs text-slate-500">הושלמו</div><div className="text-2xl font-bold mt-1 text-emerald-600">{stats.completed}</div></Card>
        <Card className="p-3"><div className="text-xs text-slate-500">בביצוע</div><div className="text-2xl font-bold mt-1 text-amber-600">{stats.inProgress}</div></Card>
        <Card className="p-3"><div className="text-xs text-slate-500">פתוחות</div><div className="text-2xl font-bold mt-1 text-blue-600">{stats.pending}</div></Card>
        <Card className="p-3"><div className="text-xs text-slate-500">באיחור</div><div className="text-2xl font-bold mt-1 text-rose-600">{stats.overdue}</div></Card>
      </div>

      {stats.totalGaps > 0 && (
        <Card className="p-3 mb-4 bg-rose-50 border-rose-300">
          <span className="text-rose-900 font-medium">⚠️ סה״כ פערים שזוהו: <b>{stats.totalGaps}</b> — <Link href="/gaps" className="underline">פתח פערים</Link></span>
        </Card>
      )}

      <Card>
        {plan.tasks.length === 0 ? (
          <EmptyState>טרם נוצרו משימות לתכנית הזו</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>פלוגה / מחסן</Th><Th>אחראי דיווח</Th><Th>מתוזמן</Th><Th>סטטוס</Th><Th>פריטים</Th><Th>פערים</Th><Th></Th></tr>
            </thead>
            <tbody>
              {plan.tasks.map((t) => {
                const cls = STATUS_CLASS[t.status as keyof typeof STATUS_CLASS] ?? "bg-slate-100";
                const lbl = STATUS_LABEL[t.status as keyof typeof STATUS_LABEL] ?? t.status;
                return (
                  <tr key={t.id}>
                    <Td>
                      <div className="font-medium">{t.holder.kind === "COMPANY" ? "🪖 " : "🏪 "}{t.holder.name}</div>
                    </Td>
                    <Td className="text-xs">{t.assignedUser?.fullName ?? <span className="text-slate-400">לא מוקצה</span>}</Td>
                    <Td className="text-xs text-slate-500">
                      {t.scheduledAt.toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </Td>
                    <Td><Badge className={cls}>{lbl}</Badge></Td>
                    <Td className="text-center text-xs">{t.session?._count.lines ?? "—"}</Td>
                    <Td className="text-center">
                      {t.session && t.session._count.discrepancies > 0
                        ? <span className="text-rose-600 font-bold">{t.session._count.discrepancies}</span>
                        : <span className="text-slate-300">—</span>}
                    </Td>
                    <Td>
                      {t.sessionId && (
                        <Link href={`/counts/${t.sessionId}`} className="text-xs text-blue-600 hover:underline">
                          {t.status === "COMPLETED" ? "צפה" : "המשך"}
                        </Link>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
