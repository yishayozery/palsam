import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card, Table, Th, Td, EmptyState } from "@/components/ui";
import { SIGNATURE_METHOD, SIGNATURE_STATUS } from "@/lib/labels";
import { cancelSignatureForm } from "./actions";
import SignoutModal from "./SignoutModal";
import CompanySignModal from "./CompanySignModal";
import CheckinModal from "./CheckinModal";

import CompanyCheckinModal from "./CompanyCheckinModal";
import { ROLE_LABELS } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function SignaturesPage({ searchParams }: { searchParams: Promise<{ reopenFor?: string }> }) {
  const { reopenFor } = await searchParams;
  const user = await requireUser();
  const bId = user.battalionId!;
  const canSign = can(user, "signatures.manage");

  // היקף: קצין מחסן/נציג רואים את המחזיקים שלהם; מפמ/צופה רואים הכל
  const scopedToOwn =
    (user.role === "WAREHOUSE_MANAGER" || user.role === "COMPANY_REP" || user.role === "VIEWER") &&
    user.holderIds.length > 0;
  const holderFilter = scopedToOwn ? { currentHolderId: { in: user.holderIds } } : {};
  // חיילים: נציג פלוגה רואה את חיילי הפלוגה; אחרת כל חיילי הגדוד.
  // מציגים את כל החיילים הפעילים כדי שתמיד תהיה רשימה. enlisted=false יסומן כתג ויחסם בצד שרת.
  const isCompanyRep = user.role === "COMPANY_REP" && !!user.holderId;
  const soldierWhere: import("@/generated/prisma").Prisma.SoldierWhereInput = {
    battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] },
    ...(isCompanyRep ? { companyId: user.holderId! } : {}),
  };
  // פלוגות לסינון בהחתמת חייל (לקצין מחסן — כדי לסנן ארוכה לפי פלוגה)
  const companiesForFilter = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "COMPANY", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const isMafam = user.isAdmin;

  const kits = user.holderId
    ? await prisma.signableKit.findMany({
        where: { holderId: user.holderId, active: true },
        include: { lines: { include: { itemType: true } } },
        orderBy: { name: "asc" },
      })
    : [];
  // פלוגות + אנשי הקשר שלהן (כל משתמש פלוגתי = נמען אפשרי)
  // מפ"מ רואה את כל הפלוגות; קצין מחסן רק אם יש לו holderId.
  // ⚠️ כולל גם משתמשים שמשויכים לפלוגה דרך UserHolder (assignedUsers) — למשל מ"פ שנוסף לפלוגת אגם
  // אבל הפרופיל הראשי שלו במקום אחר.
  const companiesForSignRaw = (user.holderId || isMafam)
    ? await prisma.holder.findMany({
        where: { battalionId: bId, kind: "COMPANY", active: true },
        include: {
          users: {
            where: { active: true },
            include: { soldier: { select: { fullName: true, personalNumber: true } } },
          },
          assignedUsers: {
            where: { user: { active: true } },
            include: { user: { include: { soldier: { select: { fullName: true, personalNumber: true } } } } },
          },
        },
        orderBy: { name: "asc" },
      })
    : [];
  // איחוד users + assignedUsers (ללא כפילויות לפי id)
  const companiesForSign = companiesForSignRaw.map((c) => {
    const all = new Map(c.users.map((u) => [u.id, u]));
    for (const a of c.assignedUsers) if (a.user) all.set(a.user.id, a.user);
    return { ...c, users: [...all.values()] };
  });
  // מלאי כמותי וסריאלי להחתמה: קצין מחסן רואה רק את שלו; מפ"מ רואה את כל מלאי הגדוד
  // ⚠️ פילטר signable !== false — פריטים שהוגדרו "ללא החתמה" לא יופיעו (כמו כסאות נח)
  const warehouseBalances = (user.holderId || isMafam)
    ? await prisma.stockBalance.findMany({
        where: {
          ...(isMafam ? { battalionId: bId } : { holderId: user.holderId! }),
          quantity: { gt: 0 },
          itemType: { signable: true },
        },
        include: { itemType: true, status: true },
      })
    : [];

  // רכבים שמשויכים לפלוגה/מחסן הנוכחיים (לבחירה כמיקום פיזי)
  const vehicles = user.holderId
    ? await prisma.serialUnit.findMany({
        where: {
          battalionId: bId,
          currentHolderId: user.holderId,
          itemType: { category: { warehouseType: "VEHICLES" } },
        },
        include: { itemType: true },
      })
    : [];

  // ציוד פלוגתי שחתום (יחידות סריאליות שמיקומן בפלוגה ולא חתומות על חייל)
  const companyHolderIds = companiesForSign.map((c) => c.id);
  // 🆕 לקצין מחסן: סינון לפי טיפוסי המחסנים שלו - רואה רק פריטים שהונפקו מהמחסן שלו
  const myWarehouseTypesForCompany = (user.role === "WAREHOUSE_MANAGER" && user.holderIds.length > 0)
    ? (await prisma.holder.findMany({
        where: { id: { in: user.holderIds }, kind: "WAREHOUSE" },
        select: { warehouseType: true },
      })).map((h) => h.warehouseType).filter((t): t is NonNullable<typeof t> => !!t)
    : [];
  const companyScopeForWM = myWarehouseTypesForCompany.length > 0
    ? { category: { warehouseType: { in: myWarehouseTypesForCompany } } }
    : {};
  const companySerials = companyHolderIds.length === 0 ? [] : await prisma.serialUnit.findMany({
    where: {
      battalionId: bId,
      currentHolderId: { in: companyHolderIds },
      signedSoldierId: null,
      itemType: { signable: true, ...companyScopeForWM },
      transferLines: { none: { transfer: { status: "PENDING" } } },
    },
    include: { itemType: true, status: true },
    orderBy: { itemType: { name: "asc" } },
  });
  // 📌 בסיסים + כמות נוכחית פר (פלוגה, פריט) - לחישוב 'זמין לזיכוי'
  const allBaselines = companyHolderIds.length === 0 ? [] : await prisma.companyItemBaseline.findMany({
    where: { battalionId: bId, companyId: { in: companyHolderIds } },
    select: { companyId: true, itemTypeId: true, permanentQuantity: true },
  });
  const { getCompanyItemTotals } = await import("@/lib/company-stock-snapshot");
  const totalsByCompany = new Map<string, Map<string, number>>();
  for (const cId of companyHolderIds) {
    totalsByCompany.set(cId, await getCompanyItemTotals(bId, cId));
  }

  const companyBalances = companyHolderIds.length === 0 ? [] : await prisma.stockBalance.findMany({
    where: {
      battalionId: bId,
      holderId: { in: companyHolderIds },
      quantity: { gt: 0 },
      itemType: { signable: true, ...companyScopeForWM },
    },
    include: { itemType: true, status: true },
  });

  // 🆕 חישוב יתרת ציוד כמותי שחתום על חיילים: SIGNOUT (COMPLETED) פחות CHECKIN (COMPLETED)
  // מסונן: רס"פ — רק חיילי הפלוגה שלו; קצין מחסן — רק חתימות מהמחסנים שלו
  const isWM = user.role === "WAREHOUSE_MANAGER" && user.holderIds.length > 0;
  const qtyLines = await prisma.transferLine.findMany({
    where: {
      transfer: {
        battalionId: bId,
        status: "COMPLETED",
        type: { in: ["SIGNOUT", "CHECKIN"] },
        ...(isCompanyRep ? { toSoldier: { companyId: user.holderId! } } : {}),
        ...(isWM ? { fromHolderId: { in: user.holderIds } } : {}),
      },
      serialUnitId: null, // רק כמותי
    },
    include: {
      itemType: { select: { name: true, sku: true, unit: true } },
      status: true,
      transfer: { select: { type: true, toSoldierId: true, toSoldier: { select: { fullName: true, personalNumber: true, companyId: true } } } },
    },
  });
  // קיבוץ לפי (soldierId, itemTypeId, statusId)
  const qtyBalance = new Map<string, {
    soldierId: string; soldierName: string; soldierPN: string | null;
    itemTypeId: string; itemName: string; sku: string | null; unit: string;
    statusId: string; statusName: string; isWear: boolean; isLoss: boolean;
    quantity: number;
  }>();
  for (const l of qtyLines) {
    const sId = l.transfer.toSoldierId;
    if (!sId || !l.statusId || !l.status) continue;
    const k = `${sId}|${l.itemTypeId}|${l.statusId}`;
    const sign = l.transfer.type === "SIGNOUT" ? 1 : -1;
    const cur = qtyBalance.get(k);
    if (cur) {
      cur.quantity += sign * l.quantity;
    } else {
      qtyBalance.set(k, {
        soldierId: sId, soldierName: l.transfer.toSoldier!.fullName, soldierPN: l.transfer.toSoldier!.personalNumber,
        itemTypeId: l.itemTypeId, itemName: l.itemType.name, sku: l.itemType.sku, unit: l.itemType.unit,
        statusId: l.statusId, statusName: l.status.name, isWear: l.status.isWear, isLoss: l.status.isLoss,
        quantity: sign * l.quantity,
      });
    }
  }
  const soldierQtyHoldings = Array.from(qtyBalance.values()).filter((q) => q.quantity > 0);

  // 🆕 לקצין מחסן: רשימת SerialUnit.id שנחתמו דרך SIGNOUT מהמחסנים שלו
  const wmSignedSerialIds = isWM ? new Set((await prisma.transferLine.findMany({
    where: {
      serialUnitId: { not: null },
      transfer: {
        battalionId: bId, type: "SIGNOUT", status: "COMPLETED",
        fromHolderId: { in: user.holderIds },
      },
    },
    select: { serialUnitId: true },
  })).map((l) => l.serialUnitId!)) : null;

  const [pending, signedUnits, soldiers, availableUnits, statuses] = await Promise.all([
    prisma.signature.findMany({
      where: { battalionId: bId, status: "PENDING" },
      include: { soldier: true, signerUser: true, transfer: { include: { lines: true, createdBy: { select: { fullName: true, title: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.serialUnit.findMany({
      // ⚠️ רס"פ פלוגה — רק ציוד שחתום על חיילי הפלוגה שלו
      // קצין מחסן — רק יחידות שהוא בעצמו החתים (יש להן SIGNOUT מאחד ממחסניו)
      where: isCompanyRep && user.holderId
        ? { battalionId: bId, signedSoldierId: { not: null }, signedSoldier: { companyId: user.holderId } }
        : isWM && wmSignedSerialIds
          ? { battalionId: bId, signedSoldierId: { not: null }, id: { in: [...wmSignedSerialIds] } }
          : { battalionId: bId, signedSoldierId: { not: null }, ...holderFilter },
      include: { itemType: true, status: true, signedSoldier: true, currentHolder: true, equipmentLocation: { select: { name: true } } },
      orderBy: { signedSoldier: { fullName: "asc" } },
    }),
    prisma.soldier.findMany({ where: soldierWhere, orderBy: { fullName: "asc" } }),
    prisma.serialUnit.findMany({
      where: {
        battalionId: bId, signedSoldierId: null,
        itemType: { signable: true },
        ...(isMafam ? {} : holderFilter),
        // ⚠️ לא מציגים פריטים שכבר בהעברה PENDING (כדי למנוע כפל-החתמה)
        transferLines: { none: { transfer: { status: "PENDING" } } },
      },
      include: { itemType: true, status: true, currentHolder: true },
      orderBy: { itemType: { name: "asc" } },
    }),
    prisma.itemStatus.findMany({ where: { battalionId: bId, active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  // 🆕 מיקומי ציוד פלוגתיים (לכל הפלוגות שמקבלות כעת ציוד)
  const allCompanyLocations = await prisma.equipmentLocation.findMany({
    where: { battalionId: bId, active: true, holder: { kind: "COMPANY" } },
    select: { id: true, name: true, holderId: true, vehicleSerialUnitId: true },
    orderBy: { name: "asc" },
  });

  // 🆕 מארזים מבצעיים — כדי שהחתמה/זיכוי יזהו מארזים על שם החייל
  const operationalKits = (isCompanyRep && user.holderId)
    ? await prisma.operationalKit.findMany({
        where: { holderId: user.holderId, active: true, assignedSoldierId: { not: null } },
        include: {
          items: { include: { itemType: { select: { id: true, name: true, sku: true } } } },
          assignedSoldier: { select: { id: true, fullName: true, personalNumber: true } },
          shelf: { select: { column: true, row: true, warehouse: { select: { name: true } } } },
        },
      })
    : [];

  // 🆕 דגל מ.א. - לתעודות חתום-בק
  const battalionConfig = await prisma.battalion.findUnique({
    where: { id: bId }, select: { requirePersonalIdOnHandover: true },
  });
  const requirePersonalIdFlag = !!battalionConfig?.requirePersonalIdOnHandover;

  // היסטוריית כל ההחתמות של פלוגות (ISSUE/RETURN בין מחסן לפלוגה) — לצפיית מפ"מ
  const companyTransfers = await prisma.transfer.findMany({
    where: {
      battalionId: bId,
      type: { in: ["ISSUE", "RETURN", "SIGNOUT", "CHECKIN"] },
      // למפ"מ — כל ההיסטוריה; לאחרים — קשורות למחסניהם
      ...(isMafam ? {} : { OR: [{ fromHolderId: { in: user.holderIds } }, { toHolderId: { in: user.holderIds } }] }),
    },
    include: {
      fromHolder: true, toHolder: true, toSoldier: true,
      createdBy: { select: { fullName: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title={isMafam ? "החתמות פלוגה / חייל" : "חתימות חיילים"}
        subtitle={isMafam ? "כל ההחתמות של פלוגות וחיילים בגדוד — מעקב והיסטוריה" : "החתמה דיגיטלית (QR/וואטסאפ/שרבוט) וזיכוי מהיר"}
        action={
          canSign ? (
            <div className="flex gap-2">
              {/* החתמת פלוגה — רק למפ"מ ולקצין מחסן (לא לרס"פ פלוגה) */}
              {!isCompanyRep && <CompanySignModal
                companies={companiesForSign.map((c) => ({
                  id: c.id, name: c.name,
                  // ⚠️ מציגים את התפקיד (title) — לא את ההרשאה (role).
                  // למשל: "מ"פ" / "רס"פ" / "מ"פלג" — לא "נציג פלוגה" / "מנהל מחסן".
                  members: c.users.map((u) => ({
                    id: u.id,
                    name: u.fullName,
                    role: u.title || ROLE_LABELS[u.role],
                    personalNumber: u.soldier?.personalNumber ?? null,
                  })),
                }))}
                units={availableUnits.map((u) => ({
                  id: u.id, itemTypeId: u.itemTypeId, itemName: u.itemType.name, serial: u.serialNumber,
                  status: u.status.name, statusId: u.statusId,
                  signMode: u.itemType.signMode,
                  lotQuantity: u.lotQuantity ?? null,
                }))}
                balances={warehouseBalances.map((b) => ({
                  itemTypeId: b.itemTypeId, statusId: b.statusId,
                  itemName: b.itemType.name, unit: b.itemType.unit,
                  status: b.status.name, quantity: b.quantity,
                  signMode: b.itemType.signMode,
                }))}
              />}
              {/* 🆕 זיכוי פלוגה — לקצין מחסן ולמפ"מ (לא לרס"פ). מקבל ציוד מפלוגה למחסן. */}
              {!isCompanyRep && (
                <CompanyCheckinModal
                  companies={companiesForSign.map((c) => ({ id: c.id, name: c.name }))}
                  serials={companySerials.map((u) => ({
                    id: u.id, itemTypeId: u.itemTypeId, itemName: u.itemType.name, serial: u.serialNumber,
                    companyId: u.currentHolderId!,
                    statusId: u.statusId, statusName: u.status.name,
                    isWear: u.status.isWear, isLoss: u.status.isLoss,
                    lotQuantity: u.lotQuantity,
                  }))}
                  balances={companyBalances.map((b) => ({
                    companyId: b.holderId, itemTypeId: b.itemTypeId, statusId: b.statusId,
                    itemName: b.itemType.name, unit: b.itemType.unit,
                    statusName: b.status.name, quantity: b.quantity,
                    isWear: b.status.isWear, isLoss: b.status.isLoss,
                  }))}
                  statuses={statuses.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault, isWear: s.isWear, isLoss: s.isLoss }))}
                  requirePersonalId={requirePersonalIdFlag}
                  baselines={allBaselines.map((b) => ({ companyId: b.companyId, itemTypeId: b.itemTypeId, baseline: b.permanentQuantity }))}
                  totals={Array.from(totalsByCompany.entries()).flatMap(([companyId, m]) =>
                    Array.from(m.entries()).map(([itemTypeId, total]) => ({ companyId, itemTypeId, total }))
                  )}
                />
              )}
              <CheckinModal
                signedUnits={signedUnits.map((u) => ({
                  id: u.id, serial: u.serialNumber, itemName: u.itemType.name,
                  soldierId: u.signedSoldierId!, soldierName: u.signedSoldier!.fullName,
                  soldierPN: u.signedSoldier!.personalNumber, companyName: null,
                  statusId: u.statusId, statusName: u.status.name,
                  isWear: u.status.isWear, isLoss: u.status.isLoss,
                  lotQuantity: u.lotQuantity,
                }))}
                qtyHoldings={soldierQtyHoldings}
                defaultToHolderId={user.holderId ?? null}
                statuses={statuses.map((s) => ({ id: s.id, name: s.name, isWear: s.isWear, isLoss: s.isLoss, isDefault: s.isDefault }))}
                operationalKits={operationalKits.map((k) => ({
                  id: k.id, name: k.name, status: k.status,
                  soldierId: k.assignedSoldierId!,
                  soldierName: k.assignedSoldier!.fullName,
                  items: k.items.map((i) => ({ itemTypeId: i.itemTypeId, itemName: i.itemType.name, sku: i.itemType.sku, quantity: i.quantity })),
                }))}
              />
              <SignoutModal
                reopenForSoldierId={reopenFor}
                companies={companiesForFilter}
                lockCompanyId={isCompanyRep ? user.holderId : null}
                isArmory={!!(await prisma.holder.findFirst({ where: { id: user.holderId ?? "__", warehouseType: "ARMORY" } }))}
                soldiers={soldiers.map((s) => {
                  const c = companiesForFilter.find((x) => x.id === s.companyId);
                  const armoryEligible = s.status === "ENLISTED" && !!s.weaponsApprovedAt && !!s.armoryTestProofAt && !!s.weaponsAgreementSignedAt;
                  return { id: s.id, name: s.fullName, pn: s.personalNumber, phone: s.phone, companyId: s.companyId, companyName: c?.name ?? null, enlisted: s.status === "ENLISTED", armoryEligible };
                })}
                units={availableUnits.map((u) => ({
                  id: u.id, itemTypeId: u.itemTypeId, itemName: u.itemType.name, serial: u.serialNumber,
                  status: u.status.name, statusId: u.statusId,
                  lotQuantity: u.lotQuantity,
                  trackLocation: u.itemType.trackLocation,
                }))}
                balances={warehouseBalances.map((b) => ({
                  itemTypeId: b.itemTypeId, itemName: b.itemType.name, unit: b.itemType.unit,
                  status: b.status.name, statusId: b.statusId, quantity: b.quantity,
                  trackLocation: b.itemType.trackLocation,
                }))}
                kits={kits.map((k) => ({
                  id: k.id, name: k.name,
                  lines: k.lines.map((l) => ({
                    name: l.itemType.name, qty: l.quantity,
                    itemTypeId: l.itemTypeId,
                    trackingMethod: l.itemType.trackingMethod,
                  })),
                }))}
                vehicles={vehicles.map((v) => ({ id: v.id, name: v.itemType.name, plate: v.serialNumber }))}
                equipmentLocations={allCompanyLocations.map((l) => ({
                  id: l.id, name: l.name, companyId: l.holderId, isVehicle: !!l.vehicleSerialUnitId,
                }))}
                operationalKits={operationalKits.map((k) => ({
                  id: k.id, name: k.name, status: k.status,
                  soldierId: k.assignedSoldierId!,
                  soldierName: k.assignedSoldier!.fullName,
                  shelfLabel: k.shelf ? `${k.shelf.warehouse.name} ${k.shelf.column}-${k.shelf.row}` : null,
                  items: k.items.map((i) => ({ itemTypeId: i.itemTypeId, itemName: i.itemType.name, sku: i.itemType.sku, quantity: i.quantity })),
                }))}
              />
            </div>
          ) : undefined
        }
      />

      {/* ממתינים לחתימת החייל */}
      <h2 className="font-bold text-slate-700 mb-2">ממתינים לחתימה</h2>
      <Card className="mb-6">
        {pending.length === 0 ? (
          <EmptyState>אין החתמות ממתינות</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>חייל</Th><Th>פריטים</Th><Th>החתים</Th><Th>שיטה</Th><Th>סטטוס</Th><Th>נוצר</Th><Th>פעולות</Th></tr>
            </thead>
            <tbody>
              {pending.map((s) => (
                <tr key={s.id}>
                  <Td className="font-medium">{s.soldier?.fullName ?? s.signerUser?.fullName ?? ""}</Td>
                  <Td className="text-center">{s.transfer?.lines.length ?? 0}</Td>
                  <Td className="text-xs">
                    {s.transfer?.createdBy ? (
                      <>
                        <div className="font-medium text-slate-700">{s.transfer.createdBy.fullName}</div>
                        {s.transfer.createdBy.title && <div className="text-[10px] text-slate-400">{s.transfer.createdBy.title}</div>}
                      </>
                    ) : "—"}
                  </Td>
                  <Td><Badge>{SIGNATURE_METHOD[s.method]}</Badge></Td>
                  <Td><Badge className="bg-amber-100 text-amber-800">{SIGNATURE_STATUS[s.status]}</Badge></Td>
                  <Td className="text-xs text-slate-500">{s.createdAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}</Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Link href={`/signatures/${s.token}`} className="text-xs text-blue-600 hover:underline">
                        קישור / QR
                      </Link>
                      {canSign && (
                        <form action={cancelSignatureForm}>
                          <input type="hidden" name="signatureId" value={s.id} />
                          <button className="text-xs text-rose-500 hover:text-rose-700">✕ ביטול</button>
                        </form>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* פריטים חתומים — מידע בלבד */}
      <h2 className="font-bold text-slate-700 mb-2">ציוד חתום על חיילים</h2>
      <Card>
        {signedUnits.length === 0 ? (
          <EmptyState>אין ציוד חתום</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>חייל</Th><Th>פריט</Th><Th>מס׳ סריאלי</Th><Th>מיקום פיזי</Th><Th>סטטוס</Th>
              </tr>
            </thead>
            <tbody>
              {signedUnits.map((u) => (
                <tr key={u.id}>
                  <Td className="font-medium text-blue-700">{u.signedSoldier?.fullName}</Td>
                  <Td>{u.itemType.name}</Td>
                  <Td className="font-mono text-xs">{u.serialNumber}</Td>
                  <Td className="text-slate-500">{u.equipmentLocation?.name ?? u.physicalLocation ?? "—"}</Td>
                  <Td><Badge>{u.status.name}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* היסטוריית כל ההחתמות (פלוגה + חייל) — מוצג למטה */}
      <h2 className="font-bold text-slate-700 mb-2 mt-6">היסטוריית תנועות (פלוגה ↔ חייל)</h2>
      <Card>
        {companyTransfers.length === 0 ? (
          <EmptyState>אין תנועות עדיין</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>תאריך</Th><Th>סוג</Th><Th>מאת</Th><Th>אל</Th><Th>פריטים</Th><Th>סטטוס</Th><Th>בוצע ע״י</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {companyTransfers.map((t) => (
                <tr key={t.id}>
                  <Td className="text-xs text-slate-500">{t.createdAt.toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</Td>
                  <Td>
                    <Badge className={
                      t.type === "ISSUE" ? "bg-blue-100 text-blue-800" :
                      t.type === "RETURN" ? "bg-emerald-100 text-emerald-800" :
                      t.type === "SIGNOUT" ? "bg-purple-100 text-purple-800" :
                      "bg-slate-100 text-slate-700"
                    }>
                      {t.type === "ISSUE" ? "📤 הקצאה" : t.type === "RETURN" ? "↩️ החזרה" : t.type === "SIGNOUT" ? "✍️ החתמת חייל" : "🔄 זיכוי"}
                    </Badge>
                  </Td>
                  <Td>{t.fromHolder?.name ?? "—"}</Td>
                  <Td>{t.toSoldier?.fullName ?? t.toHolder?.name ?? "—"}</Td>
                  <Td className="text-center">{t._count.lines}</Td>
                  <Td>
                    <Badge className={
                      t.status === "PENDING" ? "bg-amber-100 text-amber-800" :
                      t.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" :
                      "bg-rose-100 text-rose-800"
                    }>
                      {t.status === "PENDING" ? "ממתין" : t.status === "COMPLETED" ? "הושלם" : t.status}
                    </Badge>
                  </Td>
                  <Td className="text-xs text-slate-500">{t.createdBy.fullName}</Td>
                  <Td><Link href={`/transfers/${t.id}/document`} className="text-xs text-blue-600 hover:underline">תעודה</Link></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
