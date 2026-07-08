import Link from "next/link";
import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import MultiIntakeModal from "../MultiIntakeModal";
import MultiWithdrawModal from "../MultiWithdrawModal";
import ExchangeDefectiveModal from "../ExchangeDefectiveModal";
import { TRANSFER_TYPE } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function BrigadePage() {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;

  // סקופ — משתמש לא-אדמין עם מחסנים רואה רק את טיפוסי המחסנים שלו
  const myWarehouseTypes: string[] = [];
  if (!user.isAdmin && user.holderIds?.length) {
    const myHolders = await prisma.holder.findMany({
      where: { id: { in: user.holderIds }, kind: "WAREHOUSE" },
      select: { warehouseType: true },
    });
    for (const h of myHolders) if (h.warehouseType) myWarehouseTypes.push(h.warehouseType);
  }
  const isScoped = !user.isAdmin && myWarehouseTypes.length > 0;
  const scopeFilter = isScoped
    ? { category: { warehouseType: { in: myWarehouseTypes as never[] } } }
    : {};

  const [items, statuses, battalion, brotherBattalions] = await Promise.all([
    prisma.itemType.findMany({
      where: { battalionId: bId, active: true, ...scopeFilter },
      orderBy: { name: "asc" },
      include: {
        stockBalances: { include: { status: true, holder: { select: { id: true, kind: true } } } },
        serialUnits: { include: { status: true, currentHolder: { select: { id: true, kind: true } } } },
      },
    }),
    prisma.itemStatus.findMany({ where: { battalionId: bId, active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.battalion.findUnique({ where: { id: bId }, select: { requirePersonalIdOnHandover: true, brigade: true } }),
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
    ...(battalion?.brigade
      ? [{ value: `חטיבה ${battalion.brigade}`, label: `חטיבה ${battalion.brigade} (הממונה)` }]
      : [{ value: "חטיבה", label: "חטיבה (הממונה)" }]),
    ...brotherBattalions.map((b) => ({ value: `גדוד ${b.name}`, label: `גדוד ${b.name} (אחי בחטיבה)` })),
    { value: "", label: "ידני / יחידה אחרת" },
  ];

  // בלאי במחסן שלי - להחלפת בלאי מול חטיבה
  const wearStatusIds = statuses.filter((s) => s.isWear || s.isLoss).map((s) => s.id);
  const allDefectiveStocks = wearStatusIds.length === 0 ? [] : await prisma.stockBalance.findMany({
    where: {
      battalionId: bId, statusId: { in: wearStatusIds }, quantity: { gt: 0 },
      ...(isScoped ? { holderId: { in: user.holderIds } } : {}),
      ...(isScoped ? {} : { holder: { kind: "WAREHOUSE" } }),
    },
    include: {
      itemType: { select: { name: true, sku: true, unit: true } },
      status: { select: { name: true } },
    },
  });
  const defectiveAtMyWarehouse = allDefectiveStocks.map((b) => ({
    itemTypeId: b.itemTypeId, itemName: b.itemType.name, sku: b.itemType.sku, unit: b.itemType.unit,
    defectiveStatusId: b.statusId, defectiveStatusName: b.status.name, available: b.quantity,
  }));

  // סטטיסטיקות מהירות
  const intakesThisMonth = await prisma.transfer.count({
    where: {
      battalionId: bId, type: "INTAKE",
      createdAt: { gte: new Date(new Date().setDate(1)) },
      ...(isScoped ? { toHolderId: { in: user.holderIds } } : {}),
    },
  });
  const writeoffsThisMonth = await prisma.transfer.count({
    where: {
      battalionId: bId, type: "WRITE_OFF",
      createdAt: { gte: new Date(new Date().setDate(1)) },
      ...(isScoped ? { fromHolderId: { in: user.holderIds } } : {}),
    },
  });

  return (
    <div>
      <PageHeader
        title="🤝 עבודה מול החטיבה"
        subtitle="קליטות, זיכויים והחלפת בלאי מול החטיבה — תעודות מיידיות (ללא לחיצת יד)"
        action={
          <Link href="/stock"
            className="bg-white border border-slate-300 rounded-lg px-4 py-2 text-sm hover:bg-slate-50">
            ← חזרה למלאי
          </Link>
        }
      />

      {/* סטטיסטיקות החודש */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <Card className="p-3">
          <div className="text-xs text-slate-500">📥 קליטות החודש</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{intakesThisMonth}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-slate-500">📤 זיכויים החודש</div>
          <div className="text-2xl font-bold text-rose-700 mt-1">{writeoffsThisMonth}</div>
        </Card>
        <Card className={`p-3 ${defectiveAtMyWarehouse.length > 0 ? "bg-amber-50 border-amber-200" : ""}`}>
          <div className="text-xs text-slate-500">🟡 פריטי בלאי מחכים להחלפה</div>
          <div className={`text-2xl font-bold mt-1 ${defectiveAtMyWarehouse.length > 0 ? "text-amber-700" : "text-slate-800"}`}>{defectiveAtMyWarehouse.length}</div>
        </Card>
      </div>

      {/* 3 הפעולות הראשיות */}
      <Card className="p-5 mb-4">
        <h2 className="font-bold text-slate-800 text-lg mb-3">פעולות עיקריות</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4 flex flex-col items-center text-center gap-3">
            <span className="text-4xl">📥</span>
            <div className="font-bold text-emerald-900">קבלה מהחטיבה</div>
            <div className="text-xs text-slate-600">קולטים פריטים חדשים שהחטיבה סיפקה — כמותי / סריאלי / אצוות</div>
            <MultiIntakeModal
              currentUserName={user.fullName}
              requirePersonalId={requirePersonalId}
              counterpartOptions={counterpartOptions}
              items={items.filter((i) => i.trackingMethod !== "KIT").map((i) => ({
                id: i.id, name: i.name, sku: i.sku,
                trackingMethod: i.trackingMethod as "QUANTITY" | "SERIAL" | "LOT",
                unit: i.unit, trackExpiry: i.trackExpiry,
              }))}
              statuses={statuses.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault }))}
            />
          </div>

          <div className="bg-rose-50 border-2 border-rose-200 rounded-xl p-4 flex flex-col items-center text-center gap-3">
            <span className="text-4xl">📤</span>
            <div className="font-bold text-rose-900">זיכוי לחטיבה</div>
            <div className="text-xs text-slate-600">החזרה / השלכה / שינוי תקן — תעודה רב-פריטית עם מ.א. המקבל</div>
            <MultiWithdrawModal
              currentUserName={user.fullName}
              requirePersonalId={requirePersonalId}
              counterpartOptions={counterpartOptions}
              items={items.filter((i) => i.trackingMethod !== "KIT").map((i) => ({
                id: i.id, name: i.name, sku: i.sku,
                trackingMethod: i.trackingMethod as "QUANTITY" | "SERIAL" | "LOT",
                unit: i.unit, trackExpiry: i.trackExpiry,
              }))}
              statuses={statuses.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault }))}
              stocks={items.flatMap((i) => i.stockBalances
                // רק מלאי שנמצא פיזית במחסן — לא ציוד שמופץ לפלוגות (holder kind=COMPANY).
                // אחרת המערכת הציעה לזכות לחטיבה גם 20 קסדות שנמצאות בפלוגות ולא ברשות המחסן.
                .filter((b) => b.holder?.kind === "WAREHOUSE" && (!isScoped || user.holderIds.includes(b.holder.id)))
                .map((b) => ({
                  itemTypeId: i.id, statusId: b.statusId, statusName: b.status.name, quantity: b.quantity,
                })))}
              units={items.flatMap((i) => i.serialUnits.filter((u) => u.currentHolderId && !u.signedSoldierId
                // רק יחידות שנמצאות פיזית במחסן — לא יחידות שמופצות לפלוגות
                && u.currentHolder?.kind === "WAREHOUSE" && (!isScoped || user.holderIds.includes(u.currentHolderId))).map((u) => ({
                id: u.id, itemTypeId: i.id, serialNumber: u.serialNumber,
                lotQuantity: u.lotQuantity, statusId: u.statusId, statusName: u.status.name,
              })))}
            />
          </div>

          <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4 flex flex-col items-center text-center gap-3">
            <span className="text-4xl">🔄</span>
            <div className="font-bold text-purple-900">החלפת בלאי</div>
            <div className="text-xs text-slate-600">החלפת ציוד בלאי בתקין מהחטיבה — קליטה+זיכוי בתעודה אחת</div>
            <ExchangeDefectiveModal
              target="BRIGADE"
              statuses={statuses.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault, isWear: s.isWear, isLoss: s.isLoss }))}
              defectiveAtMyWarehouse={defectiveAtMyWarehouse}
              requirePersonalId={requirePersonalId}
            />
          </div>
        </div>
      </Card>

      <Card className="p-3 bg-blue-50 border-blue-200 text-sm text-blue-900">
        💡 <b>הבדל מתעודות פנים-גדוד</b>: התעודות כאן נסגרות מיידית עם החטיבה — אין &quot;לחיצת יד&quot; כי החטיבה לא משתמשת במערכת.
        כל תעודה דורשת שם המקבל בחטיבה ומ.א. (אם הגדוד מסומן כדורש).
        להעברות בין מחסן לפלוגה — ר׳ {TRANSFER_TYPE.ISSUE} ו-{TRANSFER_TYPE.RETURN} ב-{" "}
        <Link href="/transfers" className="underline">קבלות והחזרות</Link>.
      </Card>
    </div>
  );
}
