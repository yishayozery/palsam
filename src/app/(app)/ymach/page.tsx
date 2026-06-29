import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import TabNav from "@/components/TabNav";
import YmachClient from "./YmachClient";
import CompanyPicker from "@/components/CompanyPicker";

export const dynamic = "force-dynamic";

export default async function YmachPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; wh?: string; companyId?: string }>;
}) {
  const user = await requireCapability("ymach.manage");
  const bId = user.battalionId!;

  const sp = await searchParams;
  const companies = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "COMPANY", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const isCompanyHolder = user.holderId ? companies.some((c) => c.id === user.holderId) : false;
  const holderId = isCompanyHolder
    ? user.holderId
    : (sp.companyId && companies.some((c) => c.id === sp.companyId) ? sp.companyId : companies[0]?.id) ?? null;

  if (!holderId) {
    return (
      <div>
        <PageHeader title='מחסן ימ"ח' subtitle="ניהול מחסן פלוגתי — מדפים, ארגזים מבצעיים, ספירות" />
        <Card className="p-6">
          <p className="text-sm text-slate-400">אין פלוגות בגדוד.</p>
        </Card>
      </div>
    );
  }

  const tab = sp.tab || "warehouses";

  const company = await prisma.holder.findUnique({
    where: { id: holderId },
    select: { name: true, logoData: true },
  });

  // מחסני ימ"ח + מדפים + פריטים על מדפים
  const warehouses = await prisma.companyWarehouse.findMany({
    where: { holderId, active: true },
    orderBy: { name: "asc" },
    include: {
      shelves: {
        orderBy: [{ column: "asc" }, { row: "asc" }],
        include: {
          items: {
            include: { itemType: { select: { id: true, name: true, sku: true } } },
          },
          operationalKits: {
            where: { active: true },
            select: { id: true, name: true, status: true },
          },
          _count: { select: { items: true, operationalKits: true } },
        },
      },
    },
  });

  // ארגזים מבצעיים
  const operationalKits = await prisma.operationalKit.findMany({
    where: { holderId, active: true },
    orderBy: { name: "asc" },
    include: {
      items: {
        include: { itemType: { select: { id: true, name: true, sku: true } } },
      },
      shelf: {
        select: { id: true, column: true, row: true, label: true, warehouse: { select: { name: true } } },
      },
      equipmentLocation: { select: { id: true, name: true } },
      assignedSoldier: { select: { id: true, fullName: true, personalNumber: true } },
    },
  });

  // תקן (baseline) — פריטים שהפלוגה אמורה להחזיק
  const baselines = await prisma.companyItemBaseline.findMany({
    where: { companyId: holderId, permanentQuantity: { gt: 0 } },
    include: { itemType: { select: { id: true, name: true, sku: true, trackingMethod: true } } },
    orderBy: { itemType: { name: "asc" } },
  });

  // כל הפריטים בגדוד (לבחירה)
  const allItems = await prisma.itemType.findMany({
    where: { battalionId: bId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, sku: true, trackingMethod: true },
  });

  // מיקומי ציוד (לשיוך ארגזים)
  const equipmentLocations = await prisma.equipmentLocation.findMany({
    where: { holderId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // חיילי הפלוגה (לשיוך ארגזים)
  const soldiers = await prisma.soldier.findMany({
    where: { battalionId: bId, companyId: holderId, status: { in: ["ENLISTED", "REGISTERED"] } },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, personalNumber: true },
  });

  // סה"כ פריטים על מדפים
  const totalOnShelves = warehouses.reduce(
    (sum, wh) => sum + wh.shelves.reduce(
      (s2, sh) => s2 + sh.items.reduce((s3, it) => s3 + it.quantity, 0), 0), 0);
  const totalBaseline = baselines.reduce((s, b) => s + b.permanentQuantity, 0);
  const placedPct = totalBaseline === 0 ? 100 : Math.round((totalOnShelves / totalBaseline) * 100);

  const battalion = await prisma.battalion.findUnique({
    where: { id: bId },
    select: { name: true, logoData: true },
  });

  return (
    <div>
      <PageHeader
        title={`מחסן ימ"ח — ${company?.name ?? ""}`}
        subtitle="ניהול מידוף, ארגזים מבצעיים, ספירות ודוחות"
      />

      {!isCompanyHolder && companies.length > 1 && (
        <CompanyPicker companies={companies} selectedId={holderId} basePath="/ymach" extraParams={`tab=${sp.tab || "warehouses"}`} />
      )}

      {/* דשבורד קטן */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="p-3 text-center">
          <div className="text-2xl font-bold text-slate-800">{warehouses.length}</div>
          <div className="text-xs text-slate-500">מחסנים</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-2xl font-bold text-slate-800">
            {warehouses.reduce((s, w) => s + w.shelves.length, 0)}
          </div>
          <div className="text-xs text-slate-500">מדפים</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-2xl font-bold text-slate-800">{operationalKits.length}</div>
          <div className="text-xs text-slate-500">ארגזים מבצעיים</div>
        </Card>
        <Card className={`p-3 text-center ${placedPct >= 90 ? "bg-emerald-50" : placedPct >= 50 ? "bg-amber-50" : "bg-rose-50"}`}>
          <div className={`text-2xl font-bold ${placedPct >= 90 ? "text-emerald-700" : placedPct >= 50 ? "text-amber-700" : "text-rose-700"}`}>
            {placedPct}%
          </div>
          <div className="text-xs text-slate-500">ממוקם מול תקן</div>
        </Card>
      </div>

      <TabNav
        active={tab}
        tabs={[
          { key: "warehouses", label: "🗄️ מחסנים ומדפים", href: "/ymach?tab=warehouses" },
          { key: "items", label: "📦 פריטים על מדפים", href: "/ymach?tab=items" },
          { key: "kits", label: "🎒 ארגזים מבצעיים", href: "/ymach?tab=kits" },
          { key: "storage", label: "📥 אפסון", href: "/ymach?tab=storage" },
          { key: "count", label: "🔢 ספירת ימ\"ח", href: "/ymach?tab=count" },
          { key: "reports", label: "📊 דוחות", href: "/ymach?tab=reports" },
        ]}
      />

      <YmachClient
        tab={tab}
        companyName={company?.name ?? ""}
        companyLogo={company?.logoData ?? null}
        battalionName={battalion?.name ?? ""}
        battalionLogo={battalion?.logoData ?? null}
        warehouses={warehouses.map((wh) => ({
          id: wh.id,
          name: wh.name,
          notes: wh.notes,
          shelves: wh.shelves.map((sh) => ({
            id: sh.id,
            column: sh.column,
            row: sh.row,
            label: sh.label,
            itemCount: sh._count.items,
            kitCount: sh._count.operationalKits,
            items: sh.items.map((si) => ({
              itemTypeId: si.itemTypeId,
              itemName: si.itemType.name,
              sku: si.itemType.sku,
              quantity: si.quantity,
              notes: si.notes,
            })),
            kits: sh.operationalKits.map((k) => ({ id: k.id, name: k.name, status: k.status })),
          })),
        }))}
        operationalKits={operationalKits.map((k) => ({
          id: k.id,
          kitNumber: k.kitNumber,
          name: k.name,
          status: k.status,
          notes: k.notes,
          shelfId: k.shelfId,
          shelfLabel: k.shelf ? `${k.shelf.warehouse.name} ${k.shelf.column}-${k.shelf.row}` : null,
          equipmentLocationId: k.equipmentLocationId,
          equipmentLocationName: k.equipmentLocation?.name ?? null,
          assignedSoldierId: k.assignedSoldierId,
          assignedSoldierName: k.assignedSoldier?.fullName ?? null,
          items: k.items.map((ki) => ({
            itemTypeId: ki.itemTypeId,
            itemName: ki.itemType.name,
            sku: ki.itemType.sku,
            quantity: ki.quantity,
          })),
        }))}
        baselines={baselines.map((b) => ({
          itemTypeId: b.itemTypeId,
          itemName: b.itemType.name,
          sku: b.itemType.sku,
          permanentQuantity: b.permanentQuantity,
        }))}
        allItems={allItems}
        soldiers={soldiers}
        equipmentLocations={equipmentLocations}
      />
    </div>
  );
}
