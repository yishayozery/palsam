import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import ReportView from "./ReportView";

export const dynamic = "force-dynamic";

export default async function CountReportPage() {
  const user = await requireUser();
  const bId = user.battalionId!;
  const canManage = can(user, "counts.manage");
  if (!canManage) {
    return <div className="p-8 text-center text-slate-500">אין הרשאה לצפייה בדוח זה.</div>;
  }

  const [holders, stockBalances, serialUnits, lastSessions] = await Promise.all([
    prisma.holder.findMany({
      where: { battalionId: bId, active: true, kind: { in: ["WAREHOUSE", "COMPANY"] } },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true },
    }),
    prisma.stockBalance.findMany({
      where: { battalionId: bId, quantity: { gt: 0 } },
      select: {
        id: true, quantity: true,
        holderId: true,
        itemType: { select: { id: true, name: true, sku: true, trackingMethod: true, category: { select: { id: true, name: true } } } },
        equipmentLocation: { select: { name: true } },
      },
    }),
    prisma.serialUnit.findMany({
      where: { battalionId: bId, dischargedAt: null },
      select: {
        id: true, serialNumber: true, lotQuantity: true,
        currentHolderId: true,
        itemType: { select: { id: true, name: true, sku: true, trackingMethod: true, category: { select: { id: true, name: true } } } },
        signedSoldier: { select: { id: true, fullName: true, personalNumber: true } },
        equipmentLocation: { select: { name: true } },
        storedShelf: { select: { label: true } },
        physicalLocation: true,
        storageStatus: true,
        expiryDate: true,
      },
    }),
    prisma.countSession.findMany({
      where: { battalionId: bId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: 1,
      select: {
        id: true, completedAt: true,
        lines: {
          select: {
            itemTypeId: true, holderId: true, serialUnitId: true,
            expectedQty: true, countedQty: true,
          },
        },
      },
    }),
  ]);

  type Row = {
    itemId: string; itemName: string; sku: string | null; trackingMethod: string;
    categoryId: string | null; categoryName: string | null;
    holderId: string | null; holderName: string | null;
    soldierName: string | null; soldierPN: string | null;
    serialNumber: string | null;
    location: string | null; shelf: string | null;
    expiryDate: string | null;
    quantity: number;
    lastCounted: number | null;
  };

  const lastCountMap = new Map<string, number>();
  if (lastSessions.length > 0) {
    for (const line of lastSessions[0].lines) {
      const key = `${line.itemTypeId}:${line.holderId ?? ""}:${line.serialUnitId ?? ""}`;
      if (line.countedQty !== null) lastCountMap.set(key, line.countedQty);
    }
  }

  const rows: Row[] = [];

  for (const b of stockBalances) {
    const key = `${b.itemType.id}:${b.holderId}:`;
    rows.push({
      itemId: b.itemType.id,
      itemName: b.itemType.name,
      sku: b.itemType.sku,
      trackingMethod: b.itemType.trackingMethod,
      categoryId: b.itemType.category?.id ?? null,
      categoryName: b.itemType.category?.name ?? null,
      holderId: b.holderId,
      holderName: holders.find((h) => h.id === b.holderId)?.name ?? null,
      soldierName: null,
      soldierPN: null,
      serialNumber: null,
      location: b.equipmentLocation?.name ?? null,
      shelf: null,
      expiryDate: null,
      quantity: b.quantity,
      lastCounted: lastCountMap.get(key) ?? null,
    });
  }

  for (const u of serialUnits) {
    const key = `${u.itemType.id}:${u.currentHolderId ?? ""}:${u.id}`;
    rows.push({
      itemId: u.itemType.id,
      itemName: u.itemType.name,
      sku: u.itemType.sku,
      trackingMethod: u.itemType.trackingMethod,
      categoryId: u.itemType.category?.id ?? null,
      categoryName: u.itemType.category?.name ?? null,
      holderId: u.currentHolderId,
      holderName: holders.find((h) => h.id === u.currentHolderId)?.name ?? null,
      soldierName: u.signedSoldier?.fullName ?? null,
      soldierPN: u.signedSoldier?.personalNumber ?? null,
      serialNumber: u.serialNumber,
      location: u.equipmentLocation?.name ?? u.physicalLocation ?? null,
      shelf: u.storedShelf?.label ?? null,
      expiryDate: u.expiryDate?.toISOString() ?? null,
      quantity: u.lotQuantity ?? 1,
      lastCounted: lastCountMap.get(key) ?? null,
    });
  }

  const categories = Array.from(
    new Map(rows.filter((r) => r.categoryId).map((r) => [r.categoryId!, { id: r.categoryId!, name: r.categoryName! }])).values()
  ).sort((a, b) => a.name.localeCompare(b.name, "he"));

  const lastCountDate = lastSessions[0]?.completedAt?.toISOString() ?? null;

  return (
    <div>
      <PageHeader
        title="דוח פיזור ציוד"
        subtitle={`${rows.length} רשומות ציוד ב-${holders.length} מחזיקים`}
        action={
          <a href="/counts" className="bg-white border border-slate-300 text-slate-700 rounded-lg px-4 py-2 text-sm hover:bg-slate-50">
            ← חזרה לספירות
          </a>
        }
      />
      <ReportView
        rows={rows}
        holders={holders.map((h) => ({ id: h.id, name: h.name, kind: h.kind }))}
        categories={categories}
        lastCountDate={lastCountDate}
      />
    </div>
  );
}
