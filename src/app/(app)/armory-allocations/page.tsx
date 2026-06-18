import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import AllocationsClient from "./AllocationsClient";

export const dynamic = "force-dynamic";

export default async function ArmoryAllocationsPage() {
  const user = await requireCapability("weapons.approve");
  const bId = user.battalionId!;

  const companies = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "COMPANY", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (companies.length === 0) {
    return (
      <div>
        <PageHeader title="📦 הקצאה לפלוגה" subtitle="הגדר כמה מכל פריט מגיע לכל פלוגה" />
        <Card className="p-6"><EmptyState>אין פלוגות פעילות בגדוד.</EmptyState></Card>
      </div>
    );
  }

  const items = await prisma.itemType.findMany({
    where: { battalionId: bId, active: true },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    select: { id: true, name: true, sku: true, trackingMethod: true, categoryId: true, category: { select: { name: true, warehouseType: true } } },
  });

  const categories = await prisma.category.findMany({
    where: { battalionId: bId, active: true },
    orderBy: [{ warehouseType: "asc" }, { name: "asc" }],
    select: { id: true, name: true, warehouseType: true },
  });

  const allocations = await prisma.companyAllocation.findMany({
    where: { battalionId: bId },
    select: { companyId: true, itemTypeId: true, quantity: true, blockOnExceed: true },
  });

  // ספירת חתומים על חיילים פר פלוגה + פריט
  const signedUnits = await prisma.serialUnit.findMany({
    where: {
      battalionId: bId,
      signedSoldierId: { not: null },
    },
    select: {
      itemTypeId: true,
      lotQuantity: true,
      signedSoldier: { select: { company: { select: { id: true } } } },
    },
  });

  const signedCounts: { companyId: string; itemTypeId: string; count: number }[] = [];
  const countMap = new Map<string, number>();
  for (const u of signedUnits) {
    const cId = u.signedSoldier?.company?.id;
    if (!cId) continue;
    const key = `${cId}:${u.itemTypeId}`;
    countMap.set(key, (countMap.get(key) ?? 0) + (u.lotQuantity ?? 1));
  }
  for (const [key, count] of countMap) {
    const [companyId, itemTypeId] = key.split(":");
    signedCounts.push({ companyId, itemTypeId, count });
  }

  // מלאי זמין במחסנים — StockBalance (כמותי) + SerialUnit לא חתום (סריאלי)
  const [warehouseStockBal, warehouseSerials] = await Promise.all([
    prisma.stockBalance.findMany({
      where: { battalionId: bId, holder: { kind: "WAREHOUSE" }, quantity: { gt: 0 } },
      select: { itemTypeId: true, quantity: true },
    }),
    prisma.serialUnit.findMany({
      where: { battalionId: bId, signedSoldierId: null, currentHolder: { kind: "WAREHOUSE" } },
      select: { itemTypeId: true, lotQuantity: true },
    }),
  ]);
  const sMap = new Map<string, number>();
  for (const s of warehouseStockBal) {
    sMap.set(s.itemTypeId, (sMap.get(s.itemTypeId) ?? 0) + s.quantity);
  }
  for (const s of warehouseSerials) {
    sMap.set(s.itemTypeId, (sMap.get(s.itemTypeId) ?? 0) + (s.lotQuantity ?? 1));
  }
  const stockMap: { itemTypeId: string; available: number }[] = [];
  for (const [itemTypeId, available] of sMap) {
    stockMap.push({ itemTypeId, available });
  }

  // מלאי בפלוגות — StockBalance (כמותי) + SerialUnit לא חתום (סריאלי)
  const [companyStockBal, companySerials] = await Promise.all([
    prisma.stockBalance.findMany({
      where: { battalionId: bId, holder: { kind: "COMPANY" }, quantity: { gt: 0 } },
      select: { itemTypeId: true, holderId: true, quantity: true },
    }),
    prisma.serialUnit.findMany({
      where: { battalionId: bId, signedSoldierId: null, currentHolder: { kind: "COMPANY" } },
      select: { itemTypeId: true, currentHolderId: true, lotQuantity: true },
    }),
  ]);
  const csMap = new Map<string, number>();
  for (const s of companyStockBal) {
    const key = `${s.holderId}:${s.itemTypeId}`;
    csMap.set(key, (csMap.get(key) ?? 0) + s.quantity);
  }
  for (const s of companySerials) {
    if (!s.currentHolderId) continue;
    const key = `${s.currentHolderId}:${s.itemTypeId}`;
    csMap.set(key, (csMap.get(key) ?? 0) + (s.lotQuantity ?? 1));
  }
  const companyStockCounts: { companyId: string; itemTypeId: string; count: number }[] = [];
  for (const [key, count] of csMap) {
    const [companyId, itemTypeId] = key.split(":");
    companyStockCounts.push({ companyId, itemTypeId, count });
  }

  return (
    <div>
      <PageHeader
        title="📦 הקצאה לפלוגה"
        subtitle='הגדר כמה מכל פריט מגיע לכל פלוגה. בהחתמה המערכת תחסום או תתריע לפי ההגדרה. מנוהל ע"י מג"ד/סמג"ד/מפ"מ.'
      />
      <AllocationsClient
        items={items}
        companies={companies}
        categories={categories}
        allocations={allocations}
        signedCounts={signedCounts}
        warehouseStock={stockMap}
        companyStock={companyStockCounts}
      />
    </div>
  );
}
