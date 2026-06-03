import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card, Table, Th, Td, EmptyState } from "@/components/ui";
import { TRACKING_METHOD } from "@/lib/labels";
import InventoryActions from "./InventoryActions";

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ holder?: string }>;
}) {
  const user = await requireUser();
  const { holder: holderFilter } = await searchParams;
  const canManage = can(user.role, "warehouse.manage");

  const holders = await prisma.holder.findMany({
    where: { active: true },
    orderBy: { type: "asc" },
  });

  // אם המשתמש משויך למחזיק (רס"פ/ארמון) — ברירת מחדל לתחום שלו
  const effectiveHolder = holderFilter || user.holderId || undefined;

  const [balances, serialUnits, items, statuses] = await Promise.all([
    prisma.stockBalance.findMany({
      where: { quantity: { gt: 0 }, ...(effectiveHolder ? { holderId: effectiveHolder } : {}) },
      include: { itemType: true, holder: true, status: true },
      orderBy: { itemType: { name: "asc" } },
    }),
    prisma.serialUnit.findMany({
      where: effectiveHolder ? { currentHolderId: effectiveHolder } : {},
      include: { itemType: true, status: true, currentHolder: true, signedSoldier: true },
      orderBy: [{ itemType: { name: "asc" } }, { serialNumber: "asc" }],
      take: 500,
    }),
    prisma.itemType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.itemStatus.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="מלאי"
        subtitle="תמונת מלאי לפי מחזיק — כמותי, פרטני ואצווה"
        action={
          canManage ? (
            <InventoryActions
              items={items.map((i) => ({ id: i.id, name: i.name, sku: i.sku, trackingMethod: i.trackingMethod }))}
              statuses={statuses.map((s) => ({ id: s.id, name: s.name }))}
            />
          ) : undefined
        }
      />

      {/* סינון לפי מחזיק */}
      <div className="flex flex-wrap gap-2 mb-5">
        <Link href="/inventory"
          className={`text-sm rounded-lg px-3 py-1.5 ${!holderFilter ? "bg-slate-800 text-white" : "bg-white border border-slate-300 text-slate-600"}`}>
          הכל
        </Link>
        {holders.map((h) => (
          <Link key={h.id} href={`/inventory?holder=${h.id}`}
            className={`text-sm rounded-lg px-3 py-1.5 ${holderFilter === h.id ? "bg-slate-800 text-white" : "bg-white border border-slate-300 text-slate-600"}`}>
            {h.name}
          </Link>
        ))}
      </div>

      {/* מלאי כמותי */}
      <h2 className="font-bold text-slate-700 mb-2">מלאי כמותי</h2>
      <Card className="mb-6">
        {balances.length === 0 ? (
          <EmptyState>אין מלאי כמותי</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>פריט</Th><Th>מחזיק</Th><Th>סטטוס</Th><Th>כמות</Th></tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.id}>
                  <Td className="font-medium">{b.itemType.name}</Td>
                  <Td>{b.holder.name}</Td>
                  <Td><Badge>{b.status.name}</Badge></Td>
                  <Td className="font-bold">{b.quantity} {b.itemType.unit}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* מלאי סריאלי / אצווה */}
      <h2 className="font-bold text-slate-700 mb-2">מלאי פרטני ואצווה</h2>
      <Card>
        {serialUnits.length === 0 ? (
          <EmptyState>אין פריטים סריאליים</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>פריט</Th><Th>מספר סריאלי</Th><Th>סוג</Th><Th>סטטוס</Th>
                <Th>מחזיק</Th><Th>חתום על</Th><Th>מיקום פיזי</Th>
              </tr>
            </thead>
            <tbody>
              {serialUnits.map((s) => (
                <tr key={s.id}>
                  <Td className="font-medium">{s.itemType.name}</Td>
                  <Td className="font-mono text-xs">
                    {s.serialNumber}
                    {s.lotQuantity && <span className="text-slate-400"> (×{s.lotQuantity})</span>}
                  </Td>
                  <Td><Badge>{TRACKING_METHOD[s.itemType.trackingMethod]}</Badge></Td>
                  <Td><Badge>{s.status.name}</Badge></Td>
                  <Td>{s.currentHolder?.name ?? "—"}</Td>
                  <Td>{s.signedSoldier ? (
                    <span className="text-blue-600">{s.signedSoldier.fullName}</span>
                  ) : "—"}</Td>
                  <Td className="text-slate-500">{s.physicalLocation ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
