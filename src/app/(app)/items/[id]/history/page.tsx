import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card, Table, Th, Td, EmptyState } from "@/components/ui";
import { TRANSFER_TYPE, TRANSFER_STATUS, TRANSFER_STATUS_COLOR } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function ItemHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ holder?: string }>;
}) {
  const user = await requireUser();
  const bId = user.battalionId!;
  const { id } = await params;
  const { holder = "" } = await searchParams;

  const item = await prisma.itemType.findFirst({ where: { id, battalionId: bId }, include: { category: true } });
  if (!item) notFound();

  // כל הפלוגות והמחסנים בגדוד
  const holders = await prisma.holder.findMany({
    where: { battalionId: bId, active: true },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });

  // היסטוריה לפי סינון
  const where = {
    itemTypeId: id,
    transfer: {
      battalionId: bId,
      ...(holder ? { OR: [{ fromHolderId: holder }, { toHolderId: holder }] } : {}),
    },
  };
  const lines = await prisma.transferLine.findMany({
    where,
    include: {
      transfer: { include: { fromHolder: true, toHolder: true, toSoldier: true, toUser: true, createdBy: true } },
      status: true, serialUnit: true,
    },
    orderBy: { transfer: { createdAt: "desc" } },
    take: 200,
  });

  // יתרות נוכחיות לפי מחזיק
  const balances = await prisma.stockBalance.findMany({
    where: { itemTypeId: id, quantity: { gt: 0 } },
    include: { holder: true, status: true },
  });
  const serials = await prisma.serialUnit.findMany({
    where: { itemTypeId: id },
    include: { currentHolder: true, status: true },
  });

  return (
    <div>
      <PageHeader
        title={`היסטוריית: ${item.name}`}
        subtitle={`${item.sku ? `מק"ט ${item.sku} · ` : ""}${item.category?.name ?? "ללא קטגוריה"}`}
        action={<Link href="/items" className="text-sm text-slate-500 hover:text-slate-800">→ חזרה</Link>}
      />

      {/* יתרות נוכחיות */}
      <Card className="p-5 mb-5">
        <h2 className="font-bold text-slate-700 mb-3">יתרה נוכחית — לפי מחזיק וסטטוס</h2>
        {balances.length === 0 && serials.length === 0 ? (
          <p className="text-sm text-slate-400">אין מלאי</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {balances.map((b) => (
              <Badge key={b.id} className="bg-slate-100 text-slate-700">
                {b.holder.name} · {b.status.name}: <b>{b.quantity}</b>
              </Badge>
            ))}
            {serials.length > 0 && (
              <Badge className="bg-purple-100 text-purple-700">
                סריאליים: <b>{serials.length}</b>
                {serials.filter(s => !s.currentHolderId).length > 0 && (
                  <span className="text-xs"> ({serials.filter(s => !s.currentHolderId).length} במעבר)</span>
                )}
              </Badge>
            )}
          </div>
        )}
      </Card>

      {/* סינון לפי מחזיק */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <span className="text-sm text-slate-500">סנן לפי מחזיק:</span>
        <Link href={`/items/${id}/history`}
          className={`text-sm rounded-lg px-3 py-1.5 ${!holder ? "bg-slate-800 text-white" : "bg-white border border-slate-300 text-slate-600"}`}>הכל</Link>
        {holders.map((h) => (
          <Link key={h.id} href={`/items/${id}/history?holder=${h.id}`}
            className={`text-sm rounded-lg px-3 py-1.5 ${holder === h.id ? "bg-slate-800 text-white" : "bg-white border border-slate-300 text-slate-600"}`}>
            {h.name}
          </Link>
        ))}
      </div>

      {/* טבלת היסטוריה */}
      <Card>
        {lines.length === 0 ? (
          <EmptyState>אין היסטוריה</EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>תאריך</Th><Th>סוג פעולה</Th><Th>מאת</Th><Th>אל</Th><Th>כמות</Th><Th>סטטוס פריט</Th><Th>סטטוס תעודה</Th><Th>בוצע ע"י</Th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <Td className="text-xs text-slate-500">{l.transfer.createdAt.toLocaleDateString("he-IL")}</Td>
                  <Td><Badge>{TRANSFER_TYPE[l.transfer.type]}</Badge></Td>
                  <Td>{l.transfer.fromHolder?.name ?? <span className="text-slate-400">חטיבה</span>}</Td>
                  <Td>
                    {l.transfer.toHolder?.name ?? l.transfer.toSoldier?.fullName ?? l.transfer.toUser?.fullName ?? <span className="text-slate-400">חטיבה</span>}
                    {l.transfer.toUser && <span className="text-xs text-slate-400"> (משתמש)</span>}
                  </Td>
                  <Td className="font-bold">{l.quantity}</Td>
                  <Td>{l.status?.name ?? "—"}</Td>
                  <Td><Badge className={TRANSFER_STATUS_COLOR[l.transfer.status]}>{TRANSFER_STATUS[l.transfer.status]}</Badge></Td>
                  <Td className="text-xs text-slate-500">{l.transfer.createdBy.fullName}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
