import Link from "next/link";
import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge } from "@/components/ui";
import { TRANSFER_TYPE } from "@/lib/labels";
import StockTable from "./StockTable";
import StatusChangeModal from "./StatusChangeModal";
import MultiIntakeModal from "./MultiIntakeModal";
import MultiWithdrawModal from "./MultiWithdrawModal";
import SendToTanaModal from "../maintenance/SendToTanaModal";
import ExchangeDefectiveModal from "./ExchangeDefectiveModal";
import { findTanaHolder } from "@/lib/tana";
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

  // 🛡️ סקופ פר-holder: קצין מחסן רואה רק את היתרות במחסניו;
  // מפ"מ רואה רק יתרות במחסנים גדודיים (לא במלאי הפלוגות) - מסך זה מציג 'מלאי הגדוד'
  const allWarehouseIds = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "WAREHOUSE", active: true }, select: { id: true },
  }).then((rows) => rows.map((r) => r.id));
  const balanceHolderScope = isScoped
    ? { holderId: { in: user.holderIds } }
    : { holderId: { in: allWarehouseIds } };
  const serialHolderScope = isScoped
    ? { currentHolderId: { in: user.holderIds } }
    : { currentHolderId: { in: allWarehouseIds } };

  const items = await prisma.itemType.findMany({
    where: {
      battalionId: bId, active: true,
      // 🛡️ סקופ קצין מחסן: רק פריטים השייכים לטיפוסי המחסנים שלו (חייב קטגוריה עם warehouseType מתאים)
      ...(isScoped ? { category: { warehouseType: { in: myWarehouseTypes as never[] } } } : {}),
    },
    orderBy: { name: "asc" },
    include: {
      category: true,
      stockBalances: { include: { status: true, holder: { select: { id: true, name: true, kind: true } } } },
      serialUnits: {
        include: {
          status: true,
          equipmentLocation: { select: { name: true, vehicleSerialUnitId: true } },
          currentHolder: { select: { id: true, name: true, kind: true } },
          signedSoldier: { select: { companyId: true } },
        },
      },
    },
  });

  const [categories, statuses, battalion, brotherBattalions, companies] = await Promise.all([
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
    prisma.holder.findMany({
      where: { battalionId: bId, kind: "COMPANY", active: true },
      orderBy: { name: "asc" }, select: { id: true, name: true },
    }),
  ]);

  // 🆕 חישוב בלאי פר-פלוגה (לכל סטטוס תקול/אובד עם כמות > 0) - להחלפת בלאי לפלוגה
  const wearStatusIds = statuses.filter((s) => s.isWear || s.isLoss).map((s) => s.id);
  const allDefectiveStocks = wearStatusIds.length === 0 ? [] : await prisma.stockBalance.findMany({
    where: { battalionId: bId, statusId: { in: wearStatusIds }, quantity: { gt: 0 } },
    include: {
      itemType: { select: { name: true, sku: true, unit: true } },
      status: { select: { name: true } },
      holder: { select: { id: true, kind: true } },
    },
  });
  const defectiveByCompany: Record<string, Array<{
    itemTypeId: string; itemName: string; sku: string | null; unit: string;
    defectiveStatusId: string; defectiveStatusName: string; available: number;
  }>> = {};
  const defectiveAtMyWarehouseAll = isScoped
    ? allDefectiveStocks.filter((b) => b.holder?.kind === "WAREHOUSE" && user.holderIds.includes(b.holderId)).map((b) => ({
        itemTypeId: b.itemTypeId, itemName: b.itemType.name, sku: b.itemType.sku, unit: b.itemType.unit,
        defectiveStatusId: b.statusId, defectiveStatusName: b.status.name, available: b.quantity,
      }))
    : allDefectiveStocks.filter((b) => b.holder?.kind === "WAREHOUSE").map((b) => ({
        itemTypeId: b.itemTypeId, itemName: b.itemType.name, sku: b.itemType.sku, unit: b.itemType.unit,
        defectiveStatusId: b.statusId, defectiveStatusName: b.status.name, available: b.quantity,
      }));
  for (const b of allDefectiveStocks) {
    if (b.holder?.kind !== "COMPANY") continue;
    const cid = b.holderId;
    if (!defectiveByCompany[cid]) defectiveByCompany[cid] = [];
    defectiveByCompany[cid].push({
      itemTypeId: b.itemTypeId, itemName: b.itemType.name, sku: b.itemType.sku, unit: b.itemType.unit,
      defectiveStatusId: b.statusId, defectiveStatusName: b.status.name, available: b.quantity,
    });
  }
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
            <ExchangeDefectiveModal
              target="COMPANY"
              statuses={statuses.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault, isWear: s.isWear, isLoss: s.isLoss }))}
              companies={companies}
              defectiveByCompany={defectiveByCompany}
              requirePersonalId={requirePersonalId}
            />
            <ExchangeDefectiveModal
              target="BRIGADE"
              statuses={statuses.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault, isWear: s.isWear, isLoss: s.isLoss }))}
              defectiveAtMyWarehouse={defectiveAtMyWarehouseAll}
              requirePersonalId={requirePersonalId}
            />
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
              stocks={items.flatMap((i) => i.stockBalances.map((b) => ({
                itemTypeId: i.id, statusId: b.statusId, statusName: b.status.name, quantity: b.quantity,
              })))}
              units={items.flatMap((i) => i.serialUnits.filter((u) => u.currentHolderId && !u.signedSoldierId).map((u) => ({
                id: u.id, itemTypeId: i.id, serialNumber: u.serialNumber,
                lotQuantity: u.lotQuantity, statusId: u.statusId, statusName: u.status.name,
              })))}
            />
            {await (async () => {
              const tana = await findTanaHolder(bId);
              if (!tana) return null;
              // ⚠️ "שלח לטנא" שייך רק לקצין רכב (warehouseType=VEHICLES) או למפ"מ —
              // מחסן בונקר/קשר/חימוש לא שולח לטנא (טנא מטפלת רק ברכבים).
              const isMafam = user.role === "BATTALION_ADMIN";
              const isVehicleOfficer = user.role === "WAREHOUSE_MANAGER" && myWarehouseTypes.includes("VEHICLES");
              if (!isMafam && !isVehicleOfficer) return null;
              // רק רכבים (warehouseType=VEHICLES) ולא בטנא
              const myUnits = items.flatMap((i) =>
                i.serialUnits.filter((u) => u.currentHolderId !== tana.id && i.category?.warehouseType === "VEHICLES").map((u) => ({
                  id: u.id, itemTypeId: i.id, itemName: i.name, serial: u.serialNumber,
                  statusName: u.status.name, category: i.category?.name ?? null,
                }))
              );
              const myBalances = items.flatMap((i) =>
                i.stockBalances.filter((b) => b.holderId !== tana.id && i.category?.warehouseType === "VEHICLES").map((b) => ({
                  itemTypeId: i.id, statusId: b.statusId, holderId: b.holderId,
                  itemName: i.name, unit: i.unit, statusName: b.status.name,
                  quantity: b.quantity, category: i.category?.name ?? null,
                }))
              );
              if (myUnits.length === 0 && myBalances.length === 0) return null;
              return <SendToTanaModal serials={myUnits} balances={myBalances} />;
            })()}
            <StatusChangeModal
              statuses={statuses.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault, isWear: s.isWear, isLoss: s.isLoss }))}
              stocks={items.flatMap((i) => i.stockBalances.map((b) => ({
                itemTypeId: i.id, itemName: i.name, sku: i.sku, unit: i.unit,
                statusId: b.statusId, statusName: b.status.name, quantity: b.quantity,
                isWear: b.status.isWear, isLoss: b.status.isLoss,
              })))}
              units={items.flatMap((i) => i.serialUnits.map((u) => ({
                id: u.id, itemTypeId: i.id, itemName: i.name, sku: i.sku,
                serialNumber: u.serialNumber, lotQuantity: u.lotQuantity,
                statusId: u.statusId, statusName: u.status.name,
                isWear: u.status.isWear, isLoss: u.status.isLoss,
              })))}
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
            לחץ על "🕘 היסטוריה" בכל שורה לפירוט תנועות וייצוא לאקסל. להוספת מלאי חדש — "📥 הוספת מלאי" למעלה.
          </span>
        </p>
      </Card>
      <StockTable
        items={items.map((i) => {
          // 🛡️ סקופ במחסן: רק יחידות במחסנים של המשתמש
          const warehouseScopedBalances = i.stockBalances.filter((b) => isScoped
            ? user.holderIds.includes(b.holderId)
            : b.holder?.kind === "WAREHOUSE");
          const warehouseScopedSerials = i.serialUnits.filter((u) => isScoped
            ? u.currentHolderId && user.holderIds.includes(u.currentHolderId)
            : u.currentHolder?.kind === "WAREHOUSE");

          const qtyStock = warehouseScopedBalances.reduce((s, b) => s + b.quantity, 0);
          const serialFree = warehouseScopedSerials.filter((u) => !u.signedSoldierId).reduce((s, u) => s + (u.lotQuantity ?? 1), 0);
          const serialSigned = warehouseScopedSerials.filter((u) => !!u.signedSoldierId).reduce((s, u) => s + (u.lotQuantity ?? 1), 0);
          const transit = transitByItem.get(i.id) ?? 0;
          const available = qtyStock + serialFree;
          const total = available + serialSigned + transit;

          // 🆕 פילוח פר פלוגה: כמה יש לכל פלוגה, כמה חתום על חיילים, כמה תקול
          const companyMap = new Map<string, {
            companyId: string; companyName: string;
            totalQty: number; totalSerials: number;
            signedOnSoldiers: number;
            defective: number;
          }>();
          // יתרות כמותיות אצל פלוגות
          for (const b of i.stockBalances) {
            if (b.holder?.kind !== "COMPANY") continue;
            const c = companyMap.get(b.holderId) ?? {
              companyId: b.holderId, companyName: b.holder.name,
              totalQty: 0, totalSerials: 0, signedOnSoldiers: 0, defective: 0,
            };
            c.totalQty += b.quantity;
            if (b.status.isWear || b.status.isLoss) c.defective += b.quantity;
            companyMap.set(b.holderId, c);
          }
          // סריאליים שיושבים אצל פלוגות
          for (const u of i.serialUnits) {
            if (u.currentHolder?.kind === "COMPANY" && u.currentHolderId) {
              const c = companyMap.get(u.currentHolderId) ?? {
                companyId: u.currentHolderId, companyName: u.currentHolder.name,
                totalQty: 0, totalSerials: 0, signedOnSoldiers: 0, defective: 0,
              };
              c.totalSerials += (u.lotQuantity ?? 1);
              if (u.signedSoldierId) c.signedOnSoldiers += (u.lotQuantity ?? 1);
              if (u.status.isWear || u.status.isLoss) c.defective += (u.lotQuantity ?? 1);
              companyMap.set(u.currentHolderId, c);
            }
            // סריאליים שחתומים על חיילי פלוגה - גם אם currentHolder=מחסן
            else if (u.signedSoldier?.companyId && u.signedSoldier.companyId !== u.currentHolderId) {
              const cId = u.signedSoldier.companyId;
              const companyName = companies.find((c) => c.id === cId)?.name ?? "—";
              const c = companyMap.get(cId) ?? {
                companyId: cId, companyName,
                totalQty: 0, totalSerials: 0, signedOnSoldiers: 0, defective: 0,
              };
              c.signedOnSoldiers += (u.lotQuantity ?? 1);
              if (u.status.isWear || u.status.isLoss) c.defective += (u.lotQuantity ?? 1);
              companyMap.set(cId, c);
            }
          }
          const companyBreakdown = Array.from(companyMap.values())
            .filter((c) => c.totalQty + c.totalSerials + c.signedOnSoldiers > 0)
            .sort((a, b) => a.companyName.localeCompare(b.companyName));

          return {
            id: i.id, name: i.name, sku: i.sku, unit: i.unit,
            trackingMethod: i.trackingMethod, association: ASSOC[i.association],
            category: i.category?.name ?? null,
            categoryId: i.categoryId ?? null,
            warehouseType: i.category?.warehouseType ?? null,
            total, available, signedOnSoldiers: serialSigned, transit,
            companyBreakdown,
            units: warehouseScopedSerials.map((u) => ({
              id: u.id, serialNumber: u.serialNumber, lotQuantity: u.lotQuantity, statusName: u.status.name,
              locationName: u.equipmentLocation?.name ?? null,
              isVehicleLocation: !!u.equipmentLocation?.vehicleSerialUnitId,
            })),
          };
        })}
        categories={categories
          .filter((c) => !isScoped || myWarehouseTypes.includes(c.warehouseType))
          .map((c) => ({ id: c.id, name: c.name, warehouseType: c.warehouseType }))}
        statuses={statuses.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault }))}
        initialQ={q}
        initialCategory={category}
        initialWarehouse={warehouse}
        hideWarehouseFilter={isScoped}
      />
    </div>
  );
}
