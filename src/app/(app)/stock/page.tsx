import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import StockTable from "./StockTable";
import StockEntryModal from "./StockEntryModal";
import StockWithdrawModal from "./StockWithdrawModal";

export const dynamic = "force-dynamic";

const ASSOC: Record<string, string> = {
  MILITARY: "צבאי",
  DONATION_COMPANY: "תרומה (פלוגתי)",
  DONATION_BATTALION: "תרומה (גדודי)",
};

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; warehouse?: string }>;
}) {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const { q = "", category = "", warehouse = "" } = await searchParams;

  // קווי העברה במצב PENDING (מלאי במעבר)
  const transitLines = await prisma.transferLine.findMany({
    where: { transfer: { battalionId: bId, status: "PENDING", type: { in: ["ISSUE", "RETURN"] } } },
    select: { itemTypeId: true, quantity: true, serialUnitId: true },
  });
  const transitByItem = new Map<string, number>();
  for (const l of transitLines) if (!l.serialUnitId) transitByItem.set(l.itemTypeId, (transitByItem.get(l.itemTypeId) ?? 0) + l.quantity);

  const items = await prisma.itemType.findMany({
    where: { battalionId: bId, active: true },
    orderBy: { name: "asc" },
    include: {
      category: true,
      stockBalances: { include: { status: true } },
      serialUnits: { include: { status: true } },
    },
  });

  const [categories, statuses] = await Promise.all([
    prisma.category.findMany({ where: { battalionId: bId }, orderBy: { name: "asc" } }),
    prisma.itemStatus.findMany({ where: { battalionId: bId, active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="מלאי הגדוד"
        subtitle="הצהרת הכמויות שהגדוד חתום עליהן מול החטיבה — לפי מק״ט, סטטוס ושייכות"
        action={
          <div className="flex gap-2">
            <StockEntryModal
              currentUserName={user.fullName}
              items={items.map((i) => ({ id: i.id, name: i.name, sku: i.sku, trackingMethod: i.trackingMethod, unit: i.unit, association: ASSOC[i.association] }))}
              statuses={statuses.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault }))}
            />
            <StockWithdrawModal
              currentUserName={user.fullName}
              items={items.map((i) => ({ id: i.id, name: i.name, sku: i.sku, trackingMethod: i.trackingMethod, unit: i.unit }))}
              statuses={statuses.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault }))}
              stocks={items.flatMap((i) => i.stockBalances.map((b) => ({ itemTypeId: i.id, statusId: b.statusId, statusName: b.status.name, quantity: b.quantity })))}
              units={items.flatMap((i) => i.serialUnits.map((u) => ({ id: u.id, itemTypeId: i.id, serialNumber: u.serialNumber, lotQuantity: u.lotQuantity, statusName: u.status.name })))}
            />
          </div>
        }
      />
      <Card className="p-4 mb-4 bg-blue-50 border-blue-200">
        <p className="text-sm text-blue-900">
          לחץ על <b>+ הוספת מלאי</b> למעלה להזנת פריטים חדשים. ניתן לחפש לפי שם/מק״ט,
          להזין סטטוס (ברירת מחדל: תקין), ולהוסיף ידנית או לטעון מאקסל.
          <span className="block text-xs mt-1 text-blue-800">
            לחץ על "עדכן / הוסף" בכל שורה לעדכון מהיר, או "היסטוריה" לפירוט תנועות וייצוא לאקסל.
          </span>
        </p>
      </Card>
      <StockTable
        items={items.map((i) => {
          const total = i.stockBalances.reduce((s, b) => s + b.quantity, 0)
                      + i.serialUnits.reduce((s, u) => s + (u.lotQuantity ?? 1), 0)
                      + (transitByItem.get(i.id) ?? 0);
          return {
            id: i.id, name: i.name, sku: i.sku, unit: i.unit,
            trackingMethod: i.trackingMethod, association: ASSOC[i.association],
            category: i.category?.name ?? null,
            categoryId: i.categoryId ?? null,
            warehouseType: i.category?.warehouseType ?? null,
            total, transit: transitByItem.get(i.id) ?? 0,
          };
        })}
        categories={categories.map((c) => ({ id: c.id, name: c.name, warehouseType: c.warehouseType }))}
        statuses={statuses.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault }))}
        initialQ={q}
        initialCategory={category}
        initialWarehouse={warehouse}
      />
    </div>
  );
}
