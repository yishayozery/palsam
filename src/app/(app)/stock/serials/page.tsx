import Link from "next/link";
import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, EmptyState, Table, Th, Td } from "@/components/ui";
import SerialsTable from "./SerialsTable";

export const dynamic = "force-dynamic";

export default async function AllSerialsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; signed?: string }>;
}) {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const { q = "", status = "", signed = "" } = await searchParams;

  // סקופ לקצין מחסן
  const isWarehouseManager = user.role === "WAREHOUSE_MANAGER";
  const myWarehouseTypes: string[] = [];
  if (isWarehouseManager && user.holderIds?.length) {
    const myHolders = await prisma.holder.findMany({
      where: { id: { in: user.holderIds }, kind: "WAREHOUSE" },
      select: { warehouseType: true },
    });
    for (const h of myHolders) if (h.warehouseType) myWarehouseTypes.push(h.warehouseType);
  }
  const scoped = isWarehouseManager && myWarehouseTypes.length > 0;

  const units = await prisma.serialUnit.findMany({
    where: {
      battalionId: bId,
      ...(scoped ? { itemType: { category: { warehouseType: { in: myWarehouseTypes as never[] } } } } : {}),
    },
    include: {
      itemType: { include: { category: true } },
      status: true,
      currentHolder: true,
      signedSoldier: true,
    },
    orderBy: [{ itemType: { name: "asc" } }, { serialNumber: "asc" }],
  });

  return (
    <div>
      <PageHeader
        title={scoped ? "כל הסריאליים במחסן" : "כל הסריאליים בגדוד"}
        subtitle={`${units.length} יחידות${scoped ? ` במחסניך (${myWarehouseTypes.length})` : ""}`}
        action={
          <div className="flex gap-2">
            <a href={`/stock/serials/export?q=${encodeURIComponent(q)}&status=${status}&signed=${signed}`}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium">
              ⬇ ייצא Excel
            </a>
            <Link href="/stock" className="bg-white border border-slate-300 rounded-lg px-4 py-2 text-sm hover:bg-slate-50">
              → חזרה למלאי
            </Link>
          </div>
        }
      />

      {units.length === 0 ? (
        <Card><EmptyState>אין יחידות סריאליות במלאי</EmptyState></Card>
      ) : (
        <SerialsTable
          units={units.map((u) => ({
            id: u.id,
            serialNumber: u.serialNumber,
            lotQuantity: u.lotQuantity,
            itemName: u.itemType.name,
            sku: u.itemType.sku,
            category: u.itemType.category?.name ?? null,
            statusName: u.status.name,
            isWear: u.status.isWear,
            isLoss: u.status.isLoss,
            holderName: u.currentHolder?.name ?? null,
            signedSoldierName: u.signedSoldier?.fullName ?? null,
            signedSoldierPN: u.signedSoldier?.personalNumber ?? null,
          }))}
          initialQ={q}
          initialStatus={status}
          initialSigned={signed}
        />
      )}
    </div>
  );
}
