import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card, Table, Th, Td, EmptyState, StatCard } from "@/components/ui";
import { TRACKING_METHOD } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function CompanyWarehousePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (user.role === "SUPER_ADMIN") redirect("/admin/battalions");
  const bId = user.battalionId!;
  const { id } = await params;

  const company = await prisma.holder.findFirst({ where: { id, battalionId: bId, kind: "COMPANY" } });
  if (!company) notFound();

  // הרשאה: נציג/צופה של הפלוגה, או מפמ/צופה גדודי
  const isBattalionWide = user.role === "BATTALION_ADMIN" || (user.role === "VIEWER" && user.holderIds.length === 0);
  const isMine = user.holderIds.includes(company.id);
  if (!isBattalionWide && !isMine) redirect("/");

  const canOperate = can(user.role, "company.manage") && isMine;

  const [serialCount, qtyAgg, signed, wear, soldierCount] = await Promise.all([
    prisma.serialUnit.count({ where: { currentHolderId: company.id } }),
    prisma.stockBalance.aggregate({ _sum: { quantity: true }, where: { holderId: company.id } }),
    prisma.serialUnit.count({ where: { currentHolderId: company.id, signedSoldierId: { not: null } } }),
    prisma.serialUnit.count({ where: { currentHolderId: company.id, status: { OR: [{ isWear: true }, { isLoss: true }] } } }),
    prisma.soldier.count({ where: { companyId: company.id, status: { notIn: ["DISCHARGED", "INACTIVE"] } } }),
  ]);

  const [balances, serialUnits] = await Promise.all([
    prisma.stockBalance.findMany({
      where: { holderId: company.id, quantity: { gt: 0 } },
      include: { itemType: { include: { category: true } }, status: true },
      orderBy: { itemType: { name: "asc" } },
    }),
    prisma.serialUnit.findMany({
      where: { currentHolderId: company.id },
      include: { itemType: { include: { category: true } }, status: true, signedSoldier: true },
      orderBy: [{ itemType: { name: "asc" } }, { serialNumber: "asc" }],
      take: 400,
    }),
  ]);

  const actions = [
    { href: "/soldiers", label: "חיילים", icon: "🪖", show: canOperate },
    { href: "/signatures", label: "החתמות", icon: "✍️", show: can(user.role, "signatures.manage") && isMine },
    { href: "/transfers/new?type=RETURN", label: "החזרה למחסן", icon: "↩️", show: canOperate },
    { href: "/donations", label: "מלאי תרומה", icon: "🎁", show: can(user.role, "donations.manage") && isMine },
    { href: "/reports", label: "דוחות", icon: "📈", show: true },
  ].filter((a) => a.show);

  return (
    <div>
      <PageHeader
        title={`🪖 ${company.name}`}
        subtitle="המחסן הפלוגתי — כל הציוד שעל הפלוגה (מכל המחסנים)"
        action={<Link href="/warehouses" className="text-sm text-slate-500 hover:text-slate-800">→ חזרה</Link>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCard label="פריטים פרטניים" value={serialCount} hint={`${signed} חתומים`} />
        <StatCard label="מלאי כמותי" value={qtyAgg._sum.quantity ?? 0} />
        <StatCard label="חיילים" value={soldierCount} />
        <StatCard label="בלאי / אובדן" value={wear} tone={wear > 0 ? "amber" : "slate"} />
      </div>

      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {actions.map((a) => (
            <Link key={a.label} href={a.href} className="bg-white border border-slate-300 rounded-lg px-4 py-2 text-sm hover:bg-slate-50 flex items-center gap-1.5">
              <span>{a.icon}</span> {a.label}
            </Link>
          ))}
        </div>
      )}

      {balances.length > 0 && (
        <Card className="mb-4">
          <div className="p-3 font-semibold text-slate-700">מלאי כמותי</div>
          <Table>
            <thead><tr><Th>פריט</Th><Th>קטגוריה</Th><Th>סטטוס</Th><Th>כמות</Th></tr></thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.id}>
                  <Td className="font-medium">{b.itemType.name}</Td>
                  <Td className="text-slate-500">{b.itemType.category?.name ?? <Badge className="bg-purple-100 text-purple-700">תרומה</Badge>}</Td>
                  <Td><Badge>{b.status.name}</Badge></Td>
                  <Td className="font-bold">{b.quantity} {b.itemType.unit}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <Card>
        <div className="p-3 font-semibold text-slate-700">מלאי פרטני / אצווה</div>
        {serialUnits.length === 0 ? <EmptyState>אין פריטים פרטניים בפלוגה</EmptyState> : (
          <Table>
            <thead><tr><Th>פריט</Th><Th>מס״ד</Th><Th>סוג</Th><Th>סטטוס</Th><Th>חתום על</Th></tr></thead>
            <tbody>
              {serialUnits.map((s) => (
                <tr key={s.id}>
                  <Td className="font-medium">{s.itemType.name}</Td>
                  <Td className="font-mono text-xs">{s.serialNumber}{s.lotQuantity ? ` ×${s.lotQuantity}` : ""}</Td>
                  <Td><Badge>{TRACKING_METHOD[s.itemType.trackingMethod]}</Badge></Td>
                  <Td><Badge>{s.status.name}</Badge></Td>
                  <Td>{s.signedSoldier ? <span className="text-blue-600 text-sm">{s.signedSoldier.fullName}</span> : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
