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

  const [companies, soldiers] = await Promise.all([
    prisma.holder.findMany({
      where: { battalionId: bId, kind: "COMPANY", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.soldier.findMany({
      where: { battalionId: bId },
      orderBy: [{ enlisted: "asc" }, { companyId: "asc" }, { lastName: "asc" }, { fullName: "asc" }],
      include: {
        company: { select: { name: true } },
        _count: { select: { signedSerialUnits: true, signedKitInstances: true } },
      },
    }),
  ]);

  const stats = {
    total: soldiers.length,
    enlisted: soldiers.filter((s) => s.enlisted).length,
    pending: soldiers.filter((s) => !s.enlisted && s.active).length,
    inactive: soldiers.filter((s) => !s.active).length,
  };

  return (
    <div>
      <PageHeader
        title="שלישות — חיילי הגדוד"
        subtitle="ניהול רשימת חיילים. רק חיילים שאושרו (גויסו) יכולים לחתום על ציוד."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="p-3"><div className="text-xs text-slate-500">סה״כ חיילים</div><div className="text-2xl font-bold mt-1">{stats.total}</div></Card>
        <Card className="p-3"><div className="text-xs text-slate-500">מאושרים</div><div className="text-2xl font-bold mt-1 text-emerald-600">{stats.enlisted}</div></Card>
        <Card className="p-3"><div className="text-xs text-slate-500">ממתינים</div><div className="text-2xl font-bold mt-1 text-amber-600">{stats.pending}</div></Card>
        <Card className="p-3"><div className="text-xs text-slate-500">לא פעילים</div><div className="text-2xl font-bold mt-1 text-slate-400">{stats.inactive}</div></Card>
      </div>

      <Card className="p-4 mb-4 bg-blue-50 border-blue-200 text-sm text-blue-900">
        💡 השליש (משתמש מטה גדוד) מקים חיילים → מאשר גיוס. רק חיילים מאושרים יכולים לחתום על נשק/ציוד.
        ניתן לסנן לפי פלוגה, חיפוש לפי שם/מ.א., וסטטוס.
      </Card>

      {soldiers.length === 0 ? (
        <Card><EmptyState>אין חיילים. הוסף חייל ראשון בכפתור למעלה.</EmptyState></Card>
      ) : (
        <RosterTable
          soldiers={soldiers.map((s) => ({
            id: s.id, firstName: s.firstName, lastName: s.lastName, fullName: s.fullName,
            personalNumber: s.personalNumber, phone: s.phone,
            companyId: s.companyId, companyName: s.company?.name ?? null,
            platoon: s.platoon, enlisted: s.enlisted, active: s.active,
            signedCount: s._count.signedSerialUnits + s._count.signedKitInstances,
            enlistedAt: s.enlistedAt?.toISOString() ?? null,
          }))}
          companies={companies}
          initialQ={q}
          initialCompany={company}
          initialStatus={status}
        />
      )}
    </div>
  );
}
