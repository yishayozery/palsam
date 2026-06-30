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
  searchParams: Promise<{ holder?: string; view?: string }>;
}) {
  const user = await requireUser();
  const bId = user.battalionId!;
  const { id } = await params;
  const { holder = "", view = "all" } = await searchParams;

  const item = await prisma.itemType.findFirst({ where: { id, battalionId: bId }, include: { category: true } });
  if (!item) notFound();

  const holders = await prisma.holder.findMany({ where: { battalionId: bId, active: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] });

  // פילטר סוג תצוגה
  const typeWhere =
    view === "serial" ? { serialUnitId: { not: null }, serialUnit: { lotQuantity: null } } :
    view === "lot" ? { serialUnit: { lotQuantity: { not: null } } } :
    view === "quantity" ? { serialUnitId: null } : {};

  const lines = await prisma.transferLine.findMany({
    where: {
      itemTypeId: id,
      transfer: { battalionId: bId, ...(holder ? { OR: [{ fromHolderId: holder }, { toHolderId: holder }] } : {}) },
      ...typeWhere,
    },
    include: {
      transfer: { include: { fromHolder: true, toHolder: true, toSoldier: true, toUser: true, createdBy: true } },
      status: true, serialUnit: true,
    },
    orderBy: { transfer: { createdAt: "desc" } },
    take: 200,
  });

  // ספירות מלאי על הפריט
  const counts = await prisma.countLine.findMany({
    where: { itemTypeId: id, session: { battalionId: bId } },
    include: { session: { include: { startedBy: true } }, holder: true, serialUnit: true },
    orderBy: { session: { startedAt: "desc" } },
    take: 50,
  });

  // יתרות נוכחיות
  const [balances, serials] = await Promise.all([
    prisma.stockBalance.findMany({ where: { itemTypeId: id, quantity: { gt: 0 } }, include: { holder: true, status: true } }),
    prisma.serialUnit.findMany({ where: { itemTypeId: id, dischargedAt: null }, include: { currentHolder: true, status: true } }),
  ]);

  const exportUrl = `/items/${id}/history/export?view=${view}${holder ? `&holder=${holder}` : ""}`;

  return (
    <div>
      <PageHeader
        title={`היסטוריית: ${item.name}`}
        subtitle={`${item.sku ? `מק"ט ${item.sku} · ` : ""}${item.category?.name ?? "ללא קטגוריה"}`}
        action={
          <div className="flex gap-2">
            <a href={exportUrl}
              className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-emerald-700">
              ⬇ ייצוא לאקסל
            </a>
            <Link href="/items" className="text-sm text-slate-500 hover:text-slate-800 self-center">→ חזרה</Link>
          </div>
        }
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

      {/* פילטר סוג תצוגה */}
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <span className="text-sm font-semibold text-slate-700">תצוגה:</span>
        {([
          { key: "all", label: "כללי", icon: "📋" },
          { key: "serial", label: "סריאלי", icon: "🔢" },
          { key: "lot", label: "אצווה", icon: "📦" },
          { key: "quantity", label: "כמותי", icon: "🔢" },
        ] as const).map((v) => (
          <Link key={v.key} href={`/items/${id}/history?view=${v.key}${holder ? `&holder=${holder}` : ""}`}
            className={`text-sm rounded-lg px-3 py-1.5 flex items-center gap-1 ${view === v.key ? "bg-slate-800 text-white" : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
            <span>{v.icon}</span> {v.label}
          </Link>
        ))}
      </div>

      {/* פילטר מחזיק */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <span className="text-sm text-slate-500">מחזיק:</span>
        <Link href={`/items/${id}/history?view=${view}`}
          className={`text-sm rounded-lg px-3 py-1 ${!holder ? "bg-slate-700 text-white" : "bg-white border border-slate-300 text-slate-600"}`}>הכל</Link>
        {holders.map((h) => (
          <Link key={h.id} href={`/items/${id}/history?view=${view}&holder=${h.id}`}
            className={`text-sm rounded-lg px-3 py-1 ${holder === h.id ? "bg-slate-700 text-white" : "bg-white border border-slate-300 text-slate-600"}`}>
            {h.name}
          </Link>
        ))}
      </div>

      {/* תנועות מלאי */}
      <h3 className="font-bold text-slate-700 mb-2">תנועות מלאי ({lines.length})</h3>
      <Card className="mb-5">
        {lines.length === 0 ? (
          <EmptyState>אין תנועות בתצוגה זו</EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>תאריך</Th><Th>סוג</Th><Th>מאת</Th><Th>אל</Th><Th>מס״ד/אצווה</Th><Th>כמות</Th><Th>סטטוס</Th><Th>תעודה</Th><Th>בוצע ע״י</Th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <Td className="text-xs text-slate-500">{l.transfer.createdAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}</Td>
                  <Td><Badge>{TRANSFER_TYPE[l.transfer.type]}</Badge></Td>
                  <Td>{l.transfer.fromHolder?.name ?? <span className="text-slate-400">חטיבה</span>}</Td>
                  <Td>
                    {l.transfer.toHolder?.name ?? l.transfer.toSoldier?.fullName ?? l.transfer.toUser?.fullName ?? <span className="text-slate-400">חטיבה</span>}
                  </Td>
                  <Td className="font-mono text-xs">
                    {l.serialUnit?.serialNumber ?? "—"}
                    {l.serialUnit?.lotQuantity && <span className="text-slate-400"> ×{l.serialUnit.lotQuantity}</span>}
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

      {/* ספירות מלאי */}
      <h3 className="font-bold text-slate-700 mb-2">ספירות מלאי ({counts.length})</h3>
      <Card>
        {counts.length === 0 ? (
          <EmptyState>טרם בוצעו ספירות</EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>תאריך</Th><Th>סוג ספירה</Th><Th>מחזיק</Th><Th>מס״ד</Th><Th>צפוי</Th><Th>נספר</Th><Th>פער</Th><Th>בוצע ע״י</Th></tr></thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.id}>
                  <Td className="text-xs text-slate-500">{c.session.startedAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}</Td>
                  <Td><Badge>{c.session.type}</Badge></Td>
                  <Td>{c.holder?.name ?? "—"}</Td>
                  <Td className="font-mono text-xs">{c.serialUnit?.serialNumber ?? "—"}</Td>
                  <Td className="text-center">{c.expectedQty}</Td>
                  <Td className="text-center">{c.countedQty ?? <span className="text-slate-400">—</span>}</Td>
                  <Td className="text-center">
                    {c.countedQty !== null
                      ? <span className={`font-bold ${c.countedQty - c.expectedQty === 0 ? "text-emerald-600" : c.countedQty - c.expectedQty < 0 ? "text-rose-600" : "text-blue-600"}`}>
                          {c.countedQty - c.expectedQty > 0 ? `+${c.countedQty - c.expectedQty}` : c.countedQty - c.expectedQty}
                        </span>
                      : "—"}
                  </Td>
                  <Td className="text-xs text-slate-500">{c.session.startedBy.fullName}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
