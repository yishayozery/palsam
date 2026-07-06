import Link from "next/link";
import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import ReturnModal from "./ReturnModal";
import SendToTanaModal from "../maintenance/SendToTanaModal";
import { findTanaHolder } from "@/lib/tana";
import { requiresPersonalId } from "@/lib/handover";
import { getCompanyItemTotals } from "@/lib/company-stock-snapshot";
import InventoryTable from "./InventoryTable";
import CompanyPicker from "@/components/CompanyPicker";

export const dynamic = "force-dynamic";

export default async function MyInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const user = await requireCapability("company.manage");
  const bId = user.battalionId!;
  const sp = await searchParams;

  const companies = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "COMPANY", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const isCompanyHolder = user.holderId ? companies.some((c) => c.id === user.holderId) : false;
  const companyId = isCompanyHolder
    ? user.holderId
    : (sp.companyId && companies.some((c) => c.id === sp.companyId) ? sp.companyId : companies[0]?.id) ?? null;

  if (!companyId) {
    return (
      <div>
        <PageHeader title="מלאי הפלוגה" />
        <Card className="p-6"><p className="text-sm text-slate-400">אין פלוגות בגדוד.</p></Card>
      </div>
    );
  }

  // 🆕 ציוד אישי של הרס"פ (אם מקושר לחייל)
  const appUser = await prisma.appUser.findUnique({ where: { id: user.id }, select: { soldierId: true } });
  const soldierId = appUser?.soldierId ?? null;
  let personalEquipment: { itemName: string; sku: string | null; serial: string; lotQuantity: number | null; statusName: string; isWear: boolean; isLoss: boolean }[] = [];
  let personalSoldierName: string | null = null;
  if (soldierId) {
    const [serials, soldierRec] = await Promise.all([
      prisma.serialUnit.findMany({
        where: { battalionId: bId, signedSoldierId: soldierId },
        include: { itemType: true, status: true },
        orderBy: { itemType: { name: "asc" } },
      }),
      prisma.soldier.findUnique({ where: { id: soldierId }, select: { fullName: true } }),
    ]);
    personalSoldierName = soldierRec?.fullName ?? null;
    personalEquipment = serials.map((u) => ({
      itemName: u.itemType.name, sku: u.itemType.sku, serial: u.serialNumber,
      lotQuantity: u.lotQuantity, statusName: u.status.name,
      isWear: u.status.isWear, isLoss: u.status.isLoss,
    }));
  }

  const company = await prisma.holder.findUnique({ where: { id: companyId }, select: { name: true } });

  // מחסני הגדוד למסירה + דרישת מ.א.
  const [warehouses, mustHavePN] = await Promise.all([
    prisma.holder.findMany({
      where: { battalionId: bId, kind: "WAREHOUSE", active: true },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, warehouseType: true,
        users: {
          where: { active: true },
          select: { id: true, fullName: true, title: true, role: true, soldier: { select: { personalNumber: true } } },
          orderBy: { fullName: "asc" },
        },
      },
    }),
    requiresPersonalId(bId),
  ]);

  // כל הפריטים שהפלוגה חתומה עליהם (currentHolderId = company)
  const [serialUnits, balances, statuses, baselines, totalsMap] = await Promise.all([
    prisma.serialUnit.findMany({
      where: { battalionId: bId, currentHolderId: companyId },
      include: {
        itemType: { include: { category: true } },
        status: true,
        signedSoldier: true,
      },
      orderBy: [{ itemType: { name: "asc" } }, { serialNumber: "asc" }],
    }),
    prisma.stockBalance.findMany({
      where: { battalionId: bId, holderId: companyId, quantity: { gt: 0 } },
      include: {
        itemType: { include: { category: true } },
        status: true,
      },
      orderBy: { itemType: { name: "asc" } },
    }),
    prisma.itemStatus.findMany({ where: { battalionId: bId, active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.companyItemBaseline.findMany({
      where: { battalionId: bId, companyId },
      include: { itemType: { include: { category: true } } },
    }),
    getCompanyItemTotals(bId, companyId),
  ]);

  // 💡 ה-totals הישנים חישבו רק serialUnits ב-currentHolderId=company + balances,
  // אבל פספסו ציוד חתום על חיילים. החישוב המתוקן יבוא אחרי standardMap.
  let totals = { totalItems: 0, defective: 0, signedOnSoldiers: 0 };

  // 🆕 טבלת תקן - כל פריט שיש לו בסיס > 0 או שיש לו כמות נוכחית
  type StatusBreakdown = { statusName: string; qty: number; isWear: boolean; isLoss: boolean };
  type StandardRow = {
    itemTypeId: string;
    itemName: string;
    sku: string | null;
    unit: string;
    categoryName: string | null;
    warehouseType: string | null;
    sourceWarehouseName: string | null;
    baseline: number;
    companyTotal: number; // סה"כ חתום על הפלוגה (כולל חתום על חיילים)
    current: number; // במלאי (פיזי, לא כולל חתום)
    diff: number;
    statusBreakdown: Map<string, StatusBreakdown>;
    signedOnSoldiers: number;
    serialNumbers: string[];
  };
  // מיפוי warehouseType → שם מחסן (לסינון לפי מחסן מחתים)
  const whTypeToName = new Map<string, string>();
  for (const w of warehouses) {
    if (w.warehouseType && !whTypeToName.has(w.warehouseType)) {
      whTypeToName.set(w.warehouseType, w.name);
    }
  }

  const standardMap = new Map<string, StandardRow>();
  const makeRow = (itemTypeId: string, sample: { name: string; sku: string | null; unit: string; category: { name: string; warehouseType: string | null } | null }): StandardRow => ({
    itemTypeId,
    itemName: sample.name,
    sku: sample.sku,
    unit: sample.unit,
    categoryName: sample.category?.name ?? null,
    warehouseType: sample.category?.warehouseType ?? null,
    sourceWarehouseName: sample.category?.warehouseType ? (whTypeToName.get(sample.category.warehouseType) ?? null) : null,
    baseline: 0,
    companyTotal: 0,
    current: 0,
    diff: 0,
    statusBreakdown: new Map(),
    signedOnSoldiers: 0,
    serialNumbers: [],
  });
  // קודם כל הבסיסים
  for (const b of baselines) {
    const r = makeRow(b.itemTypeId, b.itemType);
    r.baseline = b.permanentQuantity;
    standardMap.set(b.itemTypeId, r);
  }
  // הוספת פריטים שיש בהם מלאי
  for (const u of serialUnits) {
    let r = standardMap.get(u.itemTypeId);
    if (!r) { r = makeRow(u.itemTypeId, u.itemType); standardMap.set(u.itemTypeId, r); }
    const qty = u.lotQuantity ?? 1;
    const sb = r.statusBreakdown.get(u.statusId);
    if (sb) sb.qty += qty;
    else r.statusBreakdown.set(u.statusId, { statusName: u.status.name, qty, isWear: u.status.isWear, isLoss: u.status.isLoss });
    if (u.signedSoldierId) r.signedOnSoldiers += qty;
    r.serialNumbers.push(u.serialNumber);
  }
  for (const b of balances) {
    let r = standardMap.get(b.itemTypeId);
    if (!r) { r = makeRow(b.itemTypeId, b.itemType); standardMap.set(b.itemTypeId, r); }
    const sb = r.statusBreakdown.get(b.statusId);
    if (sb) sb.qty += b.quantity;
    else r.statusBreakdown.set(b.statusId, { statusName: b.status.name, qty: b.quantity, isWear: b.status.isWear, isLoss: b.status.isLoss });
  }
  // אחרי שמילאנו את הפירוט - קובעים את ה-current וה-diff מ-totalsMap (אגרגציה הכוללת חתום-חיילים)
  // 🆕 וגם משלימים signedOnSoldiers ל-qty חתום (לא רק serialUnits)
  // qty חתום = totalsMap[item] - (כמותי במחסן + סריאלי אצל הפלוגה)
  for (const [itemTypeId, r] of standardMap.entries()) {
    const total = totalsMap.get(itemTypeId) ?? 0;
    r.companyTotal = total;
    const heldHere = Array.from(r.statusBreakdown.values()).reduce((s, b) => s + b.qty, 0);
    const qtySignedToSoldiers = Math.max(0, total - heldHere);
    r.signedOnSoldiers += qtySignedToSoldiers;
    r.current = total - r.signedOnSoldiers;
    r.diff = r.current - r.baseline;
  }
  const standardRows = Array.from(standardMap.values()).sort((a, b) =>
    a.itemName.localeCompare(b.itemName)
  );
  const shortage = standardRows.filter((r) => r.diff < 0); // חסר
  const surplus = standardRows.filter((r) => r.diff > 0 && r.baseline > 0); // יש מה לזכות (עודף מעל תקן)
  const balanced = standardRows.filter((r) => r.diff === 0 && r.baseline > 0); // מאוזן בדיוק לתקן

  // 📊 ספירות מאוחדות לדשבורד
  const totalCompanySigned = standardRows.reduce((s, r) => s + r.companyTotal, 0);
  totals = {
    totalItems: standardRows.reduce((s, r) => s + r.current, 0),
    defective: standardRows.reduce((s, r) =>
      s + Array.from(r.statusBreakdown.values()).filter((b) => b.isWear || b.isLoss).reduce((a, b) => a + b.qty, 0), 0),
    signedOnSoldiers: standardRows.reduce((s, r) => s + r.signedOnSoldiers, 0),
  };

  return (
    <div>
      {!isCompanyHolder && companies.length > 1 && (
        <CompanyPicker companies={companies} selectedId={companyId} basePath="/my-inventory" />
      )}

      <PageHeader
        helpKey="my-inventory"
        title={`המלאי שלי — ${company?.name ?? ""}`}
        subtitle="כל הציוד שאתה חתום עליו מול הגדוד והמחסנים"
        action={
          <div className="flex gap-2 flex-wrap">
            <Link href="/my-inventory/locations"
              className="bg-white border border-slate-300 text-slate-700 rounded-lg px-3 py-2 text-xs md:text-sm font-medium hover:bg-slate-50">
              📍 מיקומי ציוד
            </Link>
            {await (async () => {
              const tana = await findTanaHolder(bId);
              if (!tana || companyId === tana.id) return null;
              // רק רכבים — טנא מטפלת ברכבים בלבד
              const vehicleSerials = serialUnits.filter((u) => u.itemType.category?.warehouseType === "VEHICLES");
              const vehicleBalances = balances.filter((b) => b.itemType.category?.warehouseType === "VEHICLES");
              if (vehicleSerials.length === 0 && vehicleBalances.length === 0) return null;
              return (
                <SendToTanaModal
                  serials={vehicleSerials.map((u) => ({
                    id: u.id, itemTypeId: u.itemTypeId, itemName: u.itemType.name, serial: u.serialNumber,
                    statusName: u.status.name, category: u.itemType.category?.name ?? null,
                  }))}
                  balances={vehicleBalances.map((b) => ({
                    itemTypeId: b.itemTypeId, statusId: b.statusId, holderId: companyId,
                    itemName: b.itemType.name, unit: b.itemType.unit, statusName: b.status.name,
                    quantity: b.quantity, category: b.itemType.category?.name ?? null,
                  }))}
                />
              );
            })()}
          <ReturnModal
            serialUnits={serialUnits.map((u) => ({
              id: u.id, itemTypeId: u.itemTypeId, itemName: u.itemType.name, sku: u.itemType.sku,
              serial: u.serialNumber, lotQuantity: u.lotQuantity,
              signedTo: u.signedSoldier?.fullName ?? null,
              statusName: u.status.name, statusId: u.statusId, isWear: u.status.isWear, isLoss: u.status.isLoss,
              warehouseType: u.itemType.category?.warehouseType ?? null,
            }))}
            balances={balances.map((b) => ({
              itemTypeId: b.itemTypeId, itemName: b.itemType.name, unit: b.itemType.unit,
              statusId: b.statusId, statusName: b.status.name,
              isWear: b.status.isWear, isLoss: b.status.isLoss,
              quantity: b.quantity,
              warehouseType: b.itemType.category?.warehouseType ?? null,
            }))}
            statuses={statuses.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault, isWear: s.isWear, isLoss: s.isLoss }))}
            warehouses={warehouses.map((w) => ({
              id: w.id, name: w.name, warehouseType: w.warehouseType ?? null,
              recipients: w.users.map((u) => ({ id: u.id, name: u.fullName, title: u.title ?? null, personalNumber: u.soldier?.personalNumber ?? null })),
            }))}
            requirePersonalId={mustHavePN}
          />
          </div>
        }
      />

      {/* 🆕 ציוד אישי של הרס"פ */}
      {soldierId && personalEquipment.length > 0 && (
        <Card className="p-4 mb-4 bg-blue-50/50 border-blue-200">
          <h3 className="font-bold text-sm text-blue-800 mb-3">
            🪖 הציוד האישי שלי {personalSoldierName ? `(${personalSoldierName})` : ""}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-100/60 text-xs text-blue-900">
                  <th className="text-right px-3 py-2">פריט</th>
                  <th className="text-right px-3 py-2">מק״ט</th>
                  <th className="text-right px-3 py-2">סריאלי / כמות</th>
                  <th className="text-right px-3 py-2">מצב</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-100">
                {personalEquipment.map((item, i) => (
                  <tr key={`s-${i}`} className={item.isWear || item.isLoss ? "bg-amber-50/50" : ""}>
                    <td className="px-3 py-1.5 font-medium">{item.itemName}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-500">{item.sku ?? "—"}</td>
                    <td className="px-3 py-1.5 text-xs font-mono">{item.serial}{item.lotQuantity && item.lotQuantity > 1 ? ` (×${item.lotQuantity})` : ""}</td>
                    <td className="px-3 py-1.5 text-xs">{item.statusName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-xs text-blue-600">
            סה&quot;כ {personalEquipment.length} פריטים חתומים עליך אישית
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <Card className="p-3">
          <div className="text-xs text-slate-500">📋 חתום על הפלוגה</div>
          <div className="text-2xl font-bold mt-1 text-purple-600">{totalCompanySigned}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-slate-500">🪖 חתום על חיילים</div>
          <div className="text-2xl font-bold mt-1 text-blue-600">{totals.signedOnSoldiers}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-slate-500">📦 במלאי</div>
          <div className="text-2xl font-bold mt-1">{totals.totalItems}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-slate-500">בלאי / אבוד</div>
          <div className="text-2xl font-bold mt-1 text-amber-600">{totals.defective}</div>
        </Card>
        <Card className={`p-3 ${shortage.length > 0 ? "bg-rose-50 border-rose-200" : ""}`}>
          <div className={`text-xs ${shortage.length > 0 ? "text-rose-700" : "text-slate-500"}`}>חסר מתקן 📌</div>
          <div className={`text-2xl font-bold mt-1 ${shortage.length > 0 ? "text-rose-700" : "text-slate-400"}`}>{shortage.length}</div>
          {shortage.length > 0 && <div className="text-[10px] text-rose-600 mt-0.5">פריטים תחת תקן</div>}
        </Card>
        <Card className={`p-3 ${surplus.length > 0 ? "bg-emerald-50 border-emerald-200" : ""}`}>
          <div className={`text-xs ${surplus.length > 0 ? "text-emerald-700" : "text-slate-500"}`}>מותר לזכות ↩️</div>
          <div className={`text-2xl font-bold mt-1 ${surplus.length > 0 ? "text-emerald-700" : "text-slate-400"}`}>{surplus.length}</div>
          {surplus.length > 0 && <div className="text-[10px] text-emerald-600 mt-0.5">פריטים מעל תקן</div>}
        </Card>
      </div>

      {/* 📌 טבלה מאוחדת עם סינונים (Client) */}
      {standardRows.length === 0 ? (
        <Card><EmptyState>אין מלאי בפלוגה. מקבלים ציוד דרך החתמת פלוגה ע״י קצין המחסן.</EmptyState></Card>
      ) : (
        <InventoryTable rows={standardRows.map((r) => ({
          itemTypeId: r.itemTypeId,
          itemName: r.itemName,
          sku: r.sku,
          unit: r.unit,
          categoryName: r.categoryName,
          warehouseType: r.warehouseType,
          sourceWarehouseName: r.sourceWarehouseName,
          baseline: r.baseline,
          companyTotal: r.companyTotal,
          current: r.current,
          diff: r.diff,
          statusBreakdown: Array.from(r.statusBreakdown.values()),
          signedOnSoldiers: r.signedOnSoldiers,
          serialNumbers: r.serialNumbers,
        }))} />
      )}

    </div>
  );
}
