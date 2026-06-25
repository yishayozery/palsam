import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import RosterTable from "./RosterTable";

export const dynamic = "force-dynamic";

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; company?: string; status?: string }>;
}) {
  const user = await requireCapability("soldiers.roster");
  const bId = user.battalionId!;
  const { q = "", company = "", status = "" } = await searchParams;

  const [companies, soldiers, squads, attachmentRequests] = await Promise.all([
    prisma.holder.findMany({
      where: { battalionId: bId, kind: "COMPANY", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.soldier.findMany({
      where: { battalionId: bId },
      orderBy: [{ status: "asc" }, { companyId: "asc" }, { lastName: "asc" }, { fullName: "asc" }],
      include: {
        company: { select: { name: true } },
        squad: { select: { id: true, name: true } },
        _count: { select: { signedSerialUnits: true, signedKitInstances: true } },
        attachmentRequests: { orderBy: { requestedAt: "desc" }, take: 1, select: { status: true, fromDate: true, toDate: true } },
      },
    }),
    prisma.squad.findMany({
      where: { battalionId: bId },
      orderBy: [{ companyId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, companyId: true },
    }),
    prisma.attachmentRequest.findMany({
      where: { battalionId: bId },
      orderBy: { requestedAt: "desc" },
      include: {
        targetCompany: { select: { name: true } },
        requestedBy: { select: { fullName: true } },
        statusLog: {
          orderBy: { changedAt: "asc" },
          include: { changedBy: { select: { fullName: true } } },
        },
      },
    }),
  ]);

  const activeSoldiers = soldiers.filter((s) => s.status !== "DISCHARGED" && s.status !== "INACTIVE");
  const stats = {
    total: soldiers.length,
    enlisted: soldiers.filter((s) => s.status === "ENLISTED").length,
    pending: soldiers.filter((s) => s.status === "REGISTERED").length,
    inactive: soldiers.filter((s) => s.status === "DISCHARGED" || s.status === "INACTIVE").length,
    attached: activeSoldiers.filter((s) => s.attached).length,
  };

  return (
    <div>
      <PageHeader
        title="שלישות — חיילי הגדוד"
        subtitle="ניהול רשימת חיילים. רק חיילים שאושרו (גויסו) יכולים לחתום על ציוד."
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Card className="p-3"><div className="text-xs text-slate-500">סה״כ חיילים</div><div className="text-2xl font-bold mt-1">{stats.total}</div></Card>
        <Card className="p-3"><div className="text-xs text-slate-500">מאושרים</div><div className="text-2xl font-bold mt-1 text-emerald-600">{stats.enlisted}</div></Card>
        <Card className="p-3"><div className="text-xs text-slate-500">ממתינים</div><div className="text-2xl font-bold mt-1 text-amber-600">{stats.pending}</div></Card>
        <Card className="p-3"><div className="text-xs text-slate-500">לא פעילים</div><div className="text-2xl font-bold mt-1 text-slate-400">{stats.inactive}</div></Card>
        <Card className="p-3"><div className="text-xs text-slate-500">מסופחים</div><div className="text-2xl font-bold mt-1 text-blue-600">{stats.attached}</div></Card>
      </div>

      <Card className="p-4 mb-4 bg-blue-50 border-blue-200 text-sm text-blue-900">
        💡 השליש (משתמש מטה גדוד) מקים חיילים → מאשר גיוס. רק חיילים מאושרים יכולים לחתום על נשק/ציוד.
        ניתן לסנן לפי פלוגה, חיפוש לפי שם/מ.א., וסטטוס.
      </Card>

      <RosterTable
        soldiers={soldiers.map((s) => ({
          id: s.id, firstName: s.firstName, lastName: s.lastName, fullName: s.fullName,
          personalNumber: s.personalNumber, phone: s.phone,
          companyId: s.companyId, companyName: s.company?.name ?? null,
          platoon: s.platoon, squadId: s.squadId, squadName: s.squad?.name ?? null,
          status: s.status, attached: s.attached,
          signedCount: s._count.signedSerialUnits + s._count.signedKitInstances,
          enlistedAt: s.enlistedAt?.toISOString() ?? null,
          dischargedAt: s.dischargedAt?.toISOString() ?? null,
          attachReqStatus: s.attachmentRequests[0]?.status ?? null,
          attachFromDate: s.attachmentRequests[0]?.fromDate?.toISOString().slice(0, 10) ?? null,
          attachToDate: s.attachmentRequests[0]?.toDate?.toISOString().slice(0, 10) ?? null,
        }))}
        companies={companies}
        squads={squads}
        initialQ={q}
        initialCompany={company}
        initialStatus={status}
        attachmentRequests={attachmentRequests.map((r) => ({
          id: r.id,
          soldierName: r.soldierName,
          personalNumber: r.personalNumber,
          sourceUnit: r.sourceUnit,
          targetCompany: r.targetCompany?.name ?? null,
          fromDate: r.fromDate.toISOString().slice(0, 10),
          toDate: r.toDate.toISOString().slice(0, 10),
          fullEmployment: r.fromDate.getFullYear() <= 2020 && r.toDate.getFullYear() >= 2099,
          status: r.status,
          requestedBy: r.requestedBy.fullName,
          requestedAt: r.requestedAt.toISOString(),
          notes: r.notes,
          statusLog: r.statusLog.map((l) => ({
            status: l.status,
            note: l.note,
            changedBy: l.changedBy.fullName,
            changedAt: l.changedAt.toISOString(),
          })),
        }))}
      />
      {soldiers.length === 0 && (
        <Card className="mt-2">
          <EmptyState>
            <div className="space-y-3">
              <div className="text-base">🪖 אין חיילים בגדוד עדיין</div>
              <div className="text-xs">השתמש בכפתורים למעלה כדי להוסיף:</div>
              <div className="flex justify-center gap-2 flex-wrap text-xs">
                <span className="bg-emerald-100 text-emerald-800 rounded-full px-3 py-1">+ הוסף חייל בודד</span>
                <span className="bg-blue-100 text-blue-800 rounded-full px-3 py-1">⬇ הורד תבנית → ⬆ ייבוא Excel</span>
              </div>
            </div>
          </EmptyState>
        </Card>
      )}
    </div>
  );
}
