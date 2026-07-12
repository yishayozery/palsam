import Link from "next/link";
import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge } from "@/components/ui";
import { TRANSFER_TYPE } from "@/lib/labels";
import StockTable from "./StockTable";
import WarehouseSwitcher from "../signatures/WarehouseSwitcher";
import StatusChangeModal from "./StatusChangeModal";
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
  searchParams: Promise<{ q?: string; category?: string; warehouse?: string; wh?: string }>;
}) {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const { q = "", category = "", warehouse = "", wh: whParam = "" } = await searchParams;

  // סקופ — משתמש לא-אדמין עם מחסנים רואה רק את מחסניו. אם יש לו 2+ מחסנים — בורר "מחסן פעיל"
  // מאפשר לצמצם לתצוגת מחסן בודד (?wh=), אחרת מוצג האיחוד של כל מחסניו.
  const myWarehouses = (!user.isAdmin && user.holderIds?.length)
    ? await prisma.holder.findMany({
        where: { id: { in: user.holderIds }, kind: "WAREHOUSE" },
        select: { id: true, name: true, warehouseType: true }, orderBy: { name: "asc" },
      })
    : [];
  const activeHolderId: string | null = whParam && myWarehouses.some((w) => w.id === whParam) ? whParam : null;
  // היקף ה-holderIds לשאילתות מלאי — מחסן בודד אם נבחר, אחרת כל מחסני המשתמש
  const scopeIds: string[] = activeHolderId ? [activeHolderId] : (user.holderIds ?? []);
  // טיפוסי המחסן הרלוונטיים — מצטמצמים למחסן הפעיל אם נבחר
  const scopeWarehouses = activeHolderId ? myWarehouses.filter((w) => w.id === activeHolderId) : myWarehouses;
  const myWarehouseTypes = scopeWarehouses.map((w) => w.warehouseType).filter((t): t is NonNullable<typeof t> => !!t);
  const isScoped = !user.isAdmin && myWarehouses.length > 0;

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
    ? { holderId: { in: scopeIds } }
    : { holderId: { in: allWarehouseIds } };
  const serialHolderScope = isScoped
    ? { currentHolderId: { in: scopeIds } }
    : { currentHolderId: { in: allWarehouseIds } };

  const items = await prisma.itemType.findMany({
    where: {
      battalionId: bId, active: true,
      // 🛡️ סקופ קצין מחסן: כל הפריטים מהקטגוריות התואמות לטיפוסי המחסנים שלו
      // (גם בלי מלאי - אלה ה"קטלוג הצפוי" שלו), ובנוסף פריטים שיש לו פיזית מקטגוריה אחרת
      // - הם יקבלו דגל "קטגוריה אחרת" בתצוגה.
      ...(isScoped ? {
        OR: [
          { category: { warehouseType: { in: myWarehouseTypes as never[] } } },
          { stockBalances: { some: { holderId: { in: scopeIds }, quantity: { gt: 0 } } } },
          { serialUnits: { some: { currentHolderId: { in: scopeIds } } } },
        ],
      } : {}),
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
    ? allDefectiveStocks.filter((b) => b.holder?.kind === "WAREHOUSE" && scopeIds.includes(b.holderId)).map((b) => ({
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

  // 🆕 דשבורד מספרים למחסן: סריאליים, אצוות, סטטוסים
  const myItemSerials = items.flatMap((i) => i.serialUnits.filter((u) => isScoped
    ? u.currentHolderId && scopeIds.includes(u.currentHolderId)
    : u.currentHolder?.kind === "WAREHOUSE"));
  const totalSerials = myItemSerials.filter((u) => !u.lotQuantity || u.lotQuantity === 1).length;
  const totalLots = myItemSerials.filter((u) => u.lotQuantity && u.lotQuantity > 1).length;
  const defectiveSerials = myItemSerials.filter((u) => u.status.isWear || u.status.isLoss).length;
  const expiringSoonSerials = myItemSerials.filter((u) => u.expiryDate && (u.expiryDate.getTime() - Date.now()) < 30 * 86_400_000).length;

  return (
    <div>
      <PageHeader
        helpKey="stock"
        title={isScoped ? "מלאי המחסן" : "מלאי הגדוד"}
        subtitle={isScoped
          ? (activeHolderId ? `מלאי מחסן: ${scopeWarehouses[0]?.name ?? ""}` : `המלאי במחסניך (${myWarehouses.length} מחסנים)`)
          : "הצהרת הכמויות שהגדוד חתום עליהן מול החטיבה"}
        action={
          <div className="flex gap-2 flex-wrap items-center">
            <WarehouseSwitcher
              warehouses={myWarehouses.map((w) => ({ id: w.id, name: w.name }))}
              activeId={activeHolderId} allowAll allLabel="כל מחסניי" label="תצוגה"
            />
            {/* 🤝 קישור לעמוד עבודה מול החטיבה (קבלה / זיכוי / החלפת בלאי) */}
            <Link href="/locations"
              className="bg-white border border-slate-300 text-slate-700 rounded-lg px-3 py-2 text-xs md:text-sm font-medium hover:bg-slate-50">
              🗄️ מידוף
            </Link>
            <Link href="/stock/brigade"
              className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-bold">
              🤝 מול החטיבה
            </Link>
            <Link href="/expiry"
              className="bg-white border border-slate-300 text-slate-700 rounded-lg px-3 py-2 text-xs md:text-sm font-medium hover:bg-slate-50">
              📅 ניהול תוקף
            </Link>
            <Link href="/kits"
              className="bg-white border border-slate-300 text-slate-700 rounded-lg px-3 py-2 text-xs md:text-sm font-medium hover:bg-slate-50">
              ✍️ ערכת החתמה
            </Link>
            <ExchangeDefectiveModal
              target="COMPANY"
              statuses={statuses.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault, isWear: s.isWear, isLoss: s.isLoss }))}
              companies={companies}
              defectiveByCompany={defectiveByCompany}
              requirePersonalId={requirePersonalId}
            />
            {await (async () => {
              const tana = await findTanaHolder(bId);
              if (!tana) return null;
              // ⚠️ "שלח לטנא" שייך רק לקצין רכב (warehouseType=VEHICLES) או למפ"מ —
              // מחסן בונקר/קשר/חימוש לא שולח לטנא (טנא מטפלת רק ברכבים).
              const isMafam = user.isAdmin;
              const isVehicleOfficer = myWarehouseTypes.includes("VEHICLES");
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

      {/* 📊 דשבורד מספרים: סריאליים, אצוות, תקולים, פגי תוקף */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="p-3">
          <div className="text-xs text-slate-500">סריאליים במחסן</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{totalSerials}</div>
          <Link href="/stock/serials" className="text-[11px] text-blue-600 hover:underline">צפה בכולם ←</Link>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-slate-500">אצוות במחסן</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{totalLots}</div>
        </Card>
        <Card className={`p-3 ${defectiveSerials > 0 ? "bg-amber-50 border-amber-200" : ""}`}>
          <div className="text-xs text-slate-500">🟡 תקולים / אבודים</div>
          <div className={`text-2xl font-bold mt-1 ${defectiveSerials > 0 ? "text-amber-700" : "text-slate-800"}`}>{defectiveSerials}</div>
        </Card>
        <Card className={`p-3 ${expiringSoonSerials > 0 ? "bg-rose-50 border-rose-200" : ""}`}>
          <div className="text-xs text-slate-500">⏳ תפוגה בקרוב (30 ימים)</div>
          <div className={`text-2xl font-bold mt-1 ${expiringSoonSerials > 0 ? "text-rose-700" : "text-slate-800"}`}>{expiringSoonSerials}</div>
        </Card>
      </div>

      {/* 🔍 חיפוש מהיר של סריאלי / אצווה — קישור למסך ייעודי */}
      <Card className="p-3 mb-4 bg-slate-50 border-slate-200">
        <Link href="/stock/serials" className="flex items-center justify-between gap-3 hover:opacity-80">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔍</span>
            <div>
              <div className="font-bold text-slate-800 text-sm">חיפוש מהיר של פריט סריאלי / אצווה</div>
              <div className="text-xs text-slate-600">לפי מספר סריאלי, אצווה, פלוגה, סטטוס, מיקום — הקשה חלקית מספיקה</div>
            </div>
          </div>
          <span className="text-blue-600 text-sm font-medium">פתח חיפוש ←</span>
        </Link>
      </Card>
      <StockTable
        items={items.map((i) => {
          // 🛡️ סקופ במחסן: רק יחידות במחסנים של המשתמש
          const warehouseScopedBalances = i.stockBalances.filter((b) => isScoped
            ? scopeIds.includes(b.holderId)
            : b.holder?.kind === "WAREHOUSE");
          const warehouseScopedSerials = i.serialUnits.filter((u) => isScoped
            ? u.currentHolderId && scopeIds.includes(u.currentHolderId)
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

          // 🚩 קטגוריה לא תואמת: הפריט מאוחסן פיזית אצלי אבל קטגוריית-המחסן שלו שייכת לטיפוס אחר
          const itemWhType = i.category?.warehouseType ?? null;
          const categoryMismatch = isScoped && !!itemWhType && !myWarehouseTypes.includes(itemWhType);

          return {
            id: i.id, name: i.name, sku: i.sku, unit: i.unit,
            trackingMethod: i.trackingMethod, trackExpiry: i.trackExpiry, association: ASSOC[i.association],
            category: i.category?.name ?? null,
            categoryId: i.categoryId ?? null,
            warehouseType: itemWhType,
            categoryMismatch,
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
