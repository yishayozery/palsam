import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import AllocationsClient from "./AllocationsClient";

export const dynamic = "force-dynamic";

export default async function ArmoryAllocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const user = await requireCapability("weapons.approve");
  const bId = user.battalionId!;
  const sp = await searchParams;

  const companies = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "COMPANY", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (companies.length === 0) {
    return (
      <div>
        <PageHeader title="🔫 הקצאת ציוד ארמון לפלוגות" subtitle="הגדר כמה מכל פריט ארמוני מגיע לכל פלוגה" />
        <Card className="p-6"><EmptyState>אין פלוגות פעילות בגדוד.</EmptyState></Card>
      </div>
    );
  }

  const selectedCompanyId = sp.companyId && companies.some((c) => c.id === sp.companyId)
    ? sp.companyId
    : companies[0].id;

  const items = await prisma.itemType.findMany({
    where: { battalionId: bId, active: true, category: { warehouseType: "ARMORY" } },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    select: { id: true, name: true, sku: true, trackingMethod: true },
  });

  const allocations = await prisma.companyAllocation.findMany({
    where: { battalionId: bId },
    select: { companyId: true, itemTypeId: true, quantity: true, blockOnExceed: true },
  });

  // ספירת חתומים על חיילים פר פלוגה + פריט (מהארמון)
  const signedUnits = await prisma.serialUnit.findMany({
    where: {
      battalionId: bId,
      signedSoldierId: { not: null },
      itemType: { category: { warehouseType: "ARMORY" } },
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

  return (
    <div>
      <PageHeader
        title="🔫 הקצאת ציוד ארמון לפלוגות"
        subtitle='הגדר כמה מכל פריט ארמוני מגיע לכל פלוגה. בהחתמה, המערכת תחסום אם חרגו מההקצאה. מנוהל ע"י מג"ד/סמג"ד/מפ"מ.'
      />
      <AllocationsClient
        items={items}
        companies={companies}
        allocations={allocations}
        signedCounts={signedCounts}
        selectedCompanyId={selectedCompanyId}
      />
    </div>
  );
}
