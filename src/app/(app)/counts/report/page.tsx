import Link from "next/link";
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

  // 🔒 Scoping לפי תפקיד — כל אחד רואה רק את הציוד הרלוונטי לו:
  //  • קשר"ג (מנהל מחסן): הציוד מסוג המחסן שלו, כולל מה שמוחתם הלאה
  //  • רס"פ (נציג פלוגה): הציוד שהפלוגה חתומה עליו (מכל מחסן)
  //  • מפ"מ/אדמין: הכל
  const isWM = user.role === "WAREHOUSE_MANAGER" && (user.holderIds?.length ?? 0) > 0;
  const isCR = user.role === "COMPANY_REP" && !!user.holderId;
  const myWhTypes = isWM
    ? (await prisma.holder.findMany({ where: { id: { in: user.holderIds } }, select: { warehouseType: true } }))
        .map((h) => h.warehouseType).filter((t): t is NonNullable<typeof t> => !!t)
    : [];

  const stockWhere: Record<string, unknown> = { battalionId: bId, quantity: { gt: 0 } };
  const serialWhere: Record<string, unknown> = { battalionId: bId, dischargedAt: null };
  if (isWM) {
    stockWhere.holderId = { in: user.holderIds };
    serialWhere.itemType = { category: { warehouseType: { in: myWhTypes } } };
  } else if (isCR) {
    stockWhere.holderId = user.holderId;
    serialWhere.OR = [{ currentHolderId: user.holderId }, { signedSoldier: { is: { companyId: user.holderId } } }];
  }

  const [holders, stockBalances, serialUnits, lastSessions] = await Promise.all([
    prisma.holder.findMany({
      where: { battalionId: bId, active: true, kind: { in: ["WAREHOUSE", "COMPANY"] } },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true, warehouseType: true },
    }),
    prisma.stockBalance.findMany({
      where: stockWhere,
      select: {
        id: true, quantity: true,
        holderId: true,
        itemType: { select: { id: true, name: true, sku: true, trackingMethod: true, category: { select: { id: true, name: true, warehouseType: true } } } },
        equipmentLocation: { select: { name: true } },
      },
    }),
    prisma.serialUnit.findMany({
      where: serialWhere,
      select: {
        id: true, serialNumber: true, lotQuantity: true,
        currentHolderId: true,
        itemType: { select: { id: true, name: true, sku: true, trackingMethod: true, category: { select: { id: true, name: true, warehouseType: true } } } },
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

  // 🏬 מחסן מקור/מחתים — לפי סוג-המחסן של קטגוריית הפריט (WAREHOUSE holder באותו סוג)
  const whTypeToName = new Map<string, string>();
  for (const h of holders) if (h.kind === "WAREHOUSE" && h.warehouseType) whTypeToName.set(h.warehouseType, h.name);

  type Row = {
    itemId: string; itemName: string; sku: string | null; trackingMethod: string;
    categoryId: string | null; categoryName: string | null;
    sourceWarehouse: string | null;
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
      sourceWarehouse: b.itemType.category?.warehouseType ? (whTypeToName.get(b.itemType.category.warehouseType) ?? null) : null,
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
      sourceWarehouse: u.itemType.category?.warehouseType ? (whTypeToName.get(u.itemType.category.warehouseType) ?? null) : null,
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

  // 🎖️ ציוד כמותי (כללי) חתום על חיילים — נגזר מ-SIGNOUT פחות CHECKIN (אין רשומת יתרה פר-חייל)
  const qtyTransferWhere: Record<string, unknown> = {
    battalionId: bId, status: "COMPLETED", type: { in: ["SIGNOUT", "CHECKIN"] }, toSoldierId: { not: null },
  };
  if (isWM) qtyTransferWhere.fromHolderId = { in: user.holderIds };
  else if (isCR) qtyTransferWhere.toSoldier = { is: { companyId: user.holderId } };
  const soldierQtyLines = await prisma.transferLine.findMany({
    where: { serialUnitId: null, transfer: qtyTransferWhere },
    select: {
      itemTypeId: true, quantity: true,
      itemType: { select: { name: true, sku: true, trackingMethod: true, category: { select: { id: true, name: true, warehouseType: true } } } },
      transfer: { select: { type: true, toSoldierId: true, toSoldier: { select: { fullName: true, personalNumber: true, companyId: true } } } },
    },
  });
  const qtyNet = new Map<string, { itemTypeId: string; itemName: string; sku: string | null; categoryId: string | null; categoryName: string | null; warehouseType: string | null; soldierName: string; soldierPN: string | null; companyId: string | null; qty: number }>();
  for (const l of soldierQtyLines) {
    const t = l.transfer;
    if (!t.toSoldierId || !t.toSoldier) continue;
    const k = `${t.toSoldierId}|${l.itemTypeId}`;
    const sign = t.type === "SIGNOUT" ? 1 : -1;
    const cur = qtyNet.get(k);
    if (cur) cur.qty += sign * l.quantity;
    else qtyNet.set(k, {
      itemTypeId: l.itemTypeId, itemName: l.itemType.name, sku: l.itemType.sku,
      categoryId: l.itemType.category?.id ?? null, categoryName: l.itemType.category?.name ?? null,
      warehouseType: l.itemType.category?.warehouseType ?? null,
      soldierName: t.toSoldier.fullName, soldierPN: t.toSoldier.personalNumber, companyId: t.toSoldier.companyId,
      qty: sign * l.quantity,
    });
  }
  for (const q of qtyNet.values()) {
    if (q.qty <= 0) continue;
    rows.push({
      itemId: q.itemTypeId, itemName: q.itemName, sku: q.sku, trackingMethod: "QUANTITY",
      categoryId: q.categoryId, categoryName: q.categoryName,
      sourceWarehouse: q.warehouseType ? (whTypeToName.get(q.warehouseType) ?? null) : null,
      holderId: q.companyId, holderName: q.companyId ? (holders.find((h) => h.id === q.companyId)?.name ?? null) : null,
      soldierName: q.soldierName, soldierPN: q.soldierPN,
      serialNumber: null, location: null, shelf: null, expiryDate: null,
      quantity: q.qty, lastCounted: null,
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
          <Link href="/counts" className="bg-white border border-slate-300 text-slate-700 rounded-lg px-4 py-2 text-sm hover:bg-slate-50">
            ← חזרה לספירות
          </Link>
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
