import Link from "next/link";
import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge } from "@/components/ui";
import { TRANSFER_TYPE } from "@/lib/labels";
import StockTable from "./StockTable";
import StockEntryModal from "./StockEntryModal";
import StockWithdrawModal from "./StockWithdrawModal";
import StatusChangeModal from "./StatusChangeModal";
import { approveTransfer, rejectTransfer } from "../transfers/actions";

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

  // סקופ לקצין מחסן — רק טיפוסי המחסנים שהוא מורשה אליהם
  const isWarehouseManager = user.role === "WAREHOUSE_MANAGER";
  const myWarehouseTypes: string[] = [];
  if (isWarehouseManager && user.holderIds?.length) {
    const myHolders = await prisma.holder.findMany({
      where: { id: { in: user.holderIds }, kind: "WAREHOUSE" },
      select: { warehouseType: true },
    });
    for (const h of myHolders) if (h.warehouseType) myWarehouseTypes.push(h.warehouseType);
  }
  const isScoped = isWarehouseManager && myWarehouseTypes.length > 0;

  // קווי העברה במצב PENDING (מלאי במעבר)
  const transitLines = await prisma.transferLine.findMany({
    where: { transfer: { battalionId: bId, status: "PENDING", type: { in: ["ISSUE", "RETURN"] } } },
    select: { itemTypeId: true, quantity: true, serialUnitId: true },
  });
  const transitByItem = new Map<string, number>();
  for (const l of transitLines) if (!l.serialUnitId) transitByItem.set(l.itemTypeId, (transitByItem.get(l.itemTypeId) ?? 0) + l.quantity);

  const items = await prisma.itemType.findMany({
    where: {
      battalionId: bId, active: true,
      ...(isScoped ? { category: { warehouseType: { in: myWarehouseTypes as never[] } } } : {}),
    },
    orderBy: { name: "asc" },
    include: {
      category: true,
      stockBalances: { include: { status: true } },
      serialUnits: { include: { status: true } },
    },
  });

  const [categories, statuses, battalion, brotherBattalions] = await Promise.all([
    prisma.category.findMany({ where: { battalionId: bId }, orderBy: { name: "asc" } }),
    prisma.itemStatus.findMany({ where: { battalionId: bId, active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.battalion.findUnique({ where: { id: bId }, select: { requirePersonalIdOnHandover: true, brigade: true, name: true } }),
    // גדודים אחרים בחטיבה — להעברות "אחים"
    prisma.battalion.findUnique({ where: { id: bId }, select: { brigade: true } }).then((b) =>
      b?.brigade ? prisma.battalion.findMany({
        where: { brigade: b.brigade, id: { not: bId }, active: true },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      }) : []
    ),
  ]);
  const requirePersonalId = !!battalion?.requirePersonalIdOnHandover;
  const counterpartOptions = [
    ...(battalion?.brigade ? [{ value: `חטיבה ${battalion.brigade}`, label: `חטיבה ${battalion.brigade} (הממונה)` }] : [{ value: "חטיבה", label: "חטיבה (הממונה)" }]),
    ...brotherBattalions.map((b) => ({ value: `גדוד ${b.name}`, label: `גדוד ${b.name} (אחי בחטיבה)` })),
    { value: "", label: "ידני / יחידה אחרת" },
  ];

  // לחיצות יד בהמתנה — קבלות/החזרות שדורשות אישור של המשתמש
  const myHolderIds = user.holderIds ?? [];
  const pendingApprovals = myHolderIds.length === 0 ? [] : await prisma.transfer.findMany({
    where: {
      battalionId: bId, status: "PENDING",
      toHolderId: { in: myHolderIds },
    },
    orderBy: { createdAt: "desc" },
    include: {
      fromHolder: true, toHolder: true, createdBy: { select: { fullName: true } },
      lines: { include: { itemType: { select: { name: true, sku: true } } } },
    },
    take: 20,
  });

  return (
    <div>
      <PageHeader
        title={isScoped ? "מלאי המחסן" : "מלאי הגדוד"}
        subtitle={isScoped
          ? `המלאי במחסניך בלבד (${myWarehouseTypes.length} מחסנים). הוספה/גריעה מבוצעת אל המחסן שלך.`
          : "הצהרת הכמויות שהגדוד חתום עליהן מול החטיבה — לפי מק״ט, סטטוס ושייכות"}
        action={
          <div className="flex gap-2">
            <Link href="/stock/serials"
              className="bg-white border border-slate-300 text-slate-700 rounded-lg px-3 md:px-5 py-2 md:py-2.5 text-xs md:text-sm font-medium hover:bg-slate-50 flex items-center gap-2">
              📋 <span className="hidden sm:inline">כל הסריאליים</span>
            </Link>
            <StockEntryModal
              currentUserName={user.fullName}
              requirePersonalId={requirePersonalId}
              counterpartOptions={counterpartOptions}
              items={items.map((i) => ({ id: i.id, name: i.name, sku: i.sku, trackingMethod: i.trackingMethod, unit: i.unit, association: ASSOC[i.association] }))}
              statuses={statuses.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault }))}
            />
            <StockWithdrawModal
              currentUserName={user.fullName}
              requirePersonalId={requirePersonalId}
              counterpartOptions={counterpartOptions}
              items={items.map((i) => ({ id: i.id, name: i.name, sku: i.sku, trackingMethod: i.trackingMethod, unit: i.unit }))}
              statuses={statuses.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault }))}
              stocks={items.flatMap((i) => i.stockBalances.map((b) => ({ itemTypeId: i.id, statusId: b.statusId, statusName: b.status.name, quantity: b.quantity })))}
              units={items.flatMap((i) => i.serialUnits.map((u) => ({ id: u.id, itemTypeId: i.id, serialNumber: u.serialNumber, lotQuantity: u.lotQuantity, statusName: u.status.name })))}
            />
            <StatusChangeModal
              items={items.map((i) => ({ id: i.id, name: i.name, sku: i.sku, trackingMethod: i.trackingMethod, unit: i.unit }))}
              statuses={statuses.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault, isWear: s.isWear, isLoss: s.isLoss }))}
              stocks={items.flatMap((i) => i.stockBalances.map((b) => ({ itemTypeId: i.id, statusId: b.statusId, statusName: b.status.name, quantity: b.quantity })))}
              units={items.flatMap((i) => i.serialUnits.map((u) => ({ id: u.id, itemTypeId: i.id, serialNumber: u.serialNumber, lotQuantity: u.lotQuantity, statusId: u.statusId, statusName: u.status.name })))}
            />
          </div>
        }
      />
      {/* קבלות/החזרות בהמתנה לאישור — לחיצת יד */}
      {pendingApprovals.length > 0 && (
        <Card className="mb-4 p-4 border-amber-300 bg-amber-50">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-amber-900 flex items-center gap-2">
              ⏳ קבלות/החזרות ממתינות לאישור ({pendingApprovals.length})
            </h2>
            <Link href="/transfers" className="text-xs text-amber-800 hover:underline">כל הקבלות וההחזרות ←</Link>
          </div>
          <div className="space-y-2">
            {pendingApprovals.map((t) => {
              const isIncoming = t.type === "INTAKE" || t.type === "RETURN";
              const totalQty = t.lines.reduce((s, l) => s + l.quantity, 0);
              return (
                <div key={t.id} className="bg-white border border-amber-200 rounded-lg p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex-1 min-w-48">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge className={isIncoming ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}>
                          {isIncoming ? "📥 קבלה" : "📤 הוצאה"} · {TRANSFER_TYPE[t.type]}
                        </Badge>
                        <span className="text-xs text-slate-500">
                          {t.createdAt.toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="text-sm">
                        <b>מאת:</b> {t.fromHolder?.name ?? t.externalUnit ?? "חטיבה"}
                        {t.externalContact && <span className="text-slate-500"> · {t.externalContact}</span>}
                        {" "}<b>אל:</b> {t.toHolder?.name ?? "—"}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        <b>סה״כ: {totalQty} יחידות</b> ב-{t.lines.length} פריטים:
                        {" "}{t.lines.slice(0, 3).map((l, i) => (
                          <span key={l.id}>{i > 0 && ", "}{l.itemType.name} ({l.quantity})</span>
                        ))}
                        {t.lines.length > 3 && <span className="text-slate-400"> +{t.lines.length - 3}</span>}
                      </div>
                      {t.reason && <div className="text-xs text-slate-500 mt-0.5">סיבה: {t.reason}</div>}
                      {t.notes && <div className="text-xs text-rose-600 mt-0.5">הערות: {t.notes}</div>}
                      <div className="text-[11px] text-slate-400 mt-1">נוצר ע״י: {t.createdBy.fullName}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/transfers/${t.id}/document`} className="text-xs text-slate-500 hover:underline self-center">תעודה</Link>
                      <form action={approveTransfer}>
                        <input type="hidden" name="id" value={t.id} />
                        <button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5 text-sm font-medium">
                          ✓ אישור
                        </button>
                      </form>
                      <form action={rejectTransfer}>
                        <input type="hidden" name="id" value={t.id} />
                        <button className="bg-white border border-rose-300 text-rose-600 hover:bg-rose-50 rounded-lg px-3 py-1.5 text-sm">
                          דחייה
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

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
            units: i.serialUnits.map((u) => ({
              id: u.id, serialNumber: u.serialNumber, lotQuantity: u.lotQuantity, statusName: u.status.name,
            })),
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
