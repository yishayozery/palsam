import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { WAREHOUSE_TYPE_SHORT, WAREHOUSE_TYPE_ICON } from "@/lib/rbac";
import ReturnModal from "./ReturnModal";
import SendToTanaModal from "../maintenance/SendToTanaModal";
import { findTanaHolder } from "@/lib/tana";
import { requiresPersonalId } from "@/lib/handover";
import { getCompanyItemTotals } from "@/lib/company-stock-snapshot";

export const dynamic = "force-dynamic";

export default async function MyInventoryPage() {
  const user = await requireCapability("company.manage");
  const bId = user.battalionId!;
  const companyId = user.holderId;
  if (!companyId) {
    return (
      <div>
        <PageHeader title="מלאי הפלוגה" />
        <Card className="p-6"><p className="text-sm text-slate-400">לא משויך לפלוגה — פנה למפ״ם.</p></Card>
      </div>
    );
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

  // קיבוץ לפי טיפוס מחסן
  type Row = { id: string; itemName: string; sku: string | null; signedTo: string | null; statusName: string; isWear: boolean; isLoss: boolean; isSerial: boolean; serial: string; quantity: number };
  const groups = new Map<string, { whType: string | null; rows: Row[] }>();
  const addRow = (whType: string | null, r: Row) => {
    const key = whType || "OTHER";
    if (!groups.has(key)) groups.set(key, { whType, rows: [] });
    groups.get(key)!.rows.push(r);
  };
  for (const u of serialUnits) {
    const wt = u.itemType.category?.warehouseType ?? null;
    addRow(wt, {
      id: u.id, itemName: u.itemType.name, sku: u.itemType.sku,
      signedTo: u.signedSoldier?.fullName ?? null,
      statusName: u.status.name, isWear: u.status.isWear, isLoss: u.status.isLoss,
      isSerial: true, serial: u.serialNumber, quantity: u.lotQuantity ?? 1,
    });
  }
  for (const b of balances) {
    const wt = b.itemType.category?.warehouseType ?? null;
    addRow(wt, {
      id: `${b.itemTypeId}-${b.statusId}`, itemName: b.itemType.name, sku: b.itemType.sku,
      signedTo: null,
      statusName: b.status.name, isWear: b.status.isWear, isLoss: b.status.isLoss,
      isSerial: false, serial: "", quantity: b.quantity,
    });
  }

  const totals = {
    totalItems: serialUnits.length + balances.reduce((s, b) => s + b.quantity, 0),
    defective: serialUnits.filter((u) => u.status.isWear || u.status.isLoss).length
              + balances.filter((b) => b.status.isWear || b.status.isLoss).reduce((s, b) => s + b.quantity, 0),
    signedOnSoldiers: serialUnits.filter((u) => u.signedSoldierId).length,
  };

  // 🆕 טבלת תקן - כל פריט שיש לו בסיס > 0 או שיש לו כמות נוכחית
  type StandardRow = {
    itemTypeId: string;
    itemName: string;
    sku: string | null;
    unit: string;
    categoryName: string | null;
    warehouseType: string | null;
    baseline: number;
    current: number;
    diff: number; // חיובי = עודף לזיכוי, שלילי = חסר, אפס = מאוזן
  };
  const standardMap = new Map<string, StandardRow>();
  // קודם כל הבסיסים
  for (const b of baselines) {
    standardMap.set(b.itemTypeId, {
      itemTypeId: b.itemTypeId,
      itemName: b.itemType.name,
      sku: b.itemType.sku,
      unit: b.itemType.unit,
      categoryName: b.itemType.category?.name ?? null,
      warehouseType: b.itemType.category?.warehouseType ?? null,
      baseline: b.permanentQuantity,
      current: totalsMap.get(b.itemTypeId) ?? 0,
      diff: (totalsMap.get(b.itemTypeId) ?? 0) - b.permanentQuantity,
    });
  }
  // לאחר מכן פריטים שיש כמות אבל אין להם בסיס (baseline=0)
  for (const [itemTypeId, current] of totalsMap.entries()) {
    if (standardMap.has(itemTypeId) || current === 0) continue;
    // צריך לטעון את הפריט
    const sample = serialUnits.find((u) => u.itemTypeId === itemTypeId)?.itemType
      ?? balances.find((b) => b.itemTypeId === itemTypeId)?.itemType;
    if (!sample) continue;
    standardMap.set(itemTypeId, {
      itemTypeId,
      itemName: sample.name,
      sku: sample.sku,
      unit: sample.unit,
      categoryName: sample.category?.name ?? null,
      warehouseType: sample.category?.warehouseType ?? null,
      baseline: 0,
      current,
      diff: current,
    });
  }
  const standardRows = Array.from(standardMap.values()).sort((a, b) =>
    a.itemName.localeCompare(b.itemName)
  );
  const shortage = standardRows.filter((r) => r.diff < 0); // חסר
  const surplus = standardRows.filter((r) => r.diff > 0 && r.baseline > 0); // יש מה לזכות (עודף מעל תקן)
  const balanced = standardRows.filter((r) => r.diff === 0 && r.baseline > 0); // מאוזן בדיוק לתקן

  const order = ["EQUIPMENT", "COMMS", "AMMO", "ARMORY", "VEHICLES", "MEDICAL", "GENERAL", "OTHER"];
  const sortedGroups = Array.from(groups.values()).sort((a, b) => {
    const ak = a.whType ?? "OTHER";
    const bk = b.whType ?? "OTHER";
    return order.indexOf(ak) - order.indexOf(bk);
  });

  return (
    <div>
      <PageHeader
        title="מלאי הפלוגה"
        subtitle={`${company?.name ?? ""} — כל הציוד שהפלוגה חתומה עליו מול הגדוד והמחסנים`}
        action={
          <div className="flex gap-2">
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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <Card className="p-3">
          <div className="text-xs text-slate-500">סה״כ פריטים</div>
          <div className="text-2xl font-bold mt-1">{totals.totalItems}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-slate-500">חתום על חיילים</div>
          <div className="text-2xl font-bold mt-1 text-blue-600">{totals.signedOnSoldiers}</div>
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

      {/* 📌 טבלת תקן הציוד */}
      {standardRows.length > 0 && (
        <Card className="overflow-hidden mb-4">
          <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center gap-3 flex-wrap">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">
              <span className="text-xl">📌</span>
              תקן הציוד הפלוגתי
            </h3>
            <span className="text-xs text-slate-500">
              {standardRows.length} פריטים · {balanced.length} מאוזנים · {shortage.length} חסרים · {surplus.length} מעל תקן
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-right p-2 font-medium text-xs text-slate-600">פריט</th>
                  <th className="text-right p-2 font-medium text-xs text-slate-600">קטגוריה</th>
                  <th className="text-right p-2 font-medium text-xs text-slate-600">📌 תקן</th>
                  <th className="text-right p-2 font-medium text-xs text-slate-600">📦 יש</th>
                  <th className="text-right p-2 font-medium text-xs text-slate-600">הפרש</th>
                  <th className="text-right p-2 font-medium text-xs text-slate-600">מצב</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {standardRows.map((r) => {
                  const rowClass = r.diff < 0 ? "bg-rose-50" : r.diff > 0 && r.baseline > 0 ? "bg-emerald-50" : "";
                  return (
                    <tr key={r.itemTypeId} className={rowClass}>
                      <td className="p-2">
                        <div className="font-medium">{r.itemName}</div>
                        {r.sku && <div className="text-[11px] text-slate-500 font-mono">{r.sku}</div>}
                      </td>
                      <td className="p-2 text-xs text-slate-600">{r.categoryName ?? "—"}</td>
                      <td className="p-2 font-mono">
                        <span className="bg-slate-100 rounded px-2 py-0.5">{r.baseline}</span>
                        <span className="text-[10px] text-slate-400 mr-1">{r.unit}</span>
                      </td>
                      <td className="p-2 font-mono">
                        <span className="bg-blue-50 text-blue-700 rounded px-2 py-0.5">{r.current}</span>
                        <span className="text-[10px] text-slate-400 mr-1">{r.unit}</span>
                      </td>
                      <td className="p-2 font-mono">
                        {r.diff < 0 && <span className="text-rose-700 font-bold">{r.diff}</span>}
                        {r.diff === 0 && <span className="text-slate-500">0</span>}
                        {r.diff > 0 && <span className="text-emerald-700">+{r.diff}</span>}
                      </td>
                      <td className="p-2">
                        {r.diff < 0 && r.baseline > 0 && (
                          <Badge className="bg-rose-100 text-rose-700">
                            ⚠️ חסר {Math.abs(r.diff)}
                          </Badge>
                        )}
                        {r.diff === 0 && r.baseline > 0 && (
                          <Badge className="bg-emerald-100 text-emerald-700">✓ מאוזן</Badge>
                        )}
                        {r.diff > 0 && r.baseline > 0 && (
                          <Badge className="bg-emerald-100 text-emerald-700">↩️ ניתן לזכות {r.diff}</Badge>
                        )}
                        {r.baseline === 0 && (
                          <Badge className="bg-slate-100 text-slate-600">
                            ללא תקן · ניתן לזכות הכל
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-2.5 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-600">
            💡 <b>תקן</b> = הכמות שאמורה להישאר אצלכם גם אחרי תעסוקה (קבע ע&quot;י מפ&quot;ם).
            לעדכון פנו למפ&quot;ם.
          </div>
        </Card>
      )}

      {sortedGroups.length === 0 ? (
        <Card><EmptyState>אין מלאי בפלוגה. מקבלים ציוד דרך החתמת פלוגה ע״י קצין המחסן.</EmptyState></Card>
      ) : (
        <div className="space-y-4">
          {sortedGroups.map((g) => {
            const key = g.whType ?? "OTHER";
            const icon = key === "OTHER" ? "📦" : (WAREHOUSE_TYPE_ICON[key as keyof typeof WAREHOUSE_TYPE_ICON] || "📦");
            const label = key === "OTHER" ? "ללא קטגוריה" : (WAREHOUSE_TYPE_SHORT[key as keyof typeof WAREHOUSE_TYPE_SHORT] || key);
            return (
              <Card key={key} className="overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="font-bold text-slate-700 flex items-center gap-2">
                    <span className="text-xl">{icon}</span>
                    {label}
                  </h3>
                  <span className="text-xs text-slate-500">{g.rows.length} פריטים</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {g.rows.map((r) => (
                    <div key={r.id} className="px-4 py-2 flex items-center gap-3 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{r.itemName}</div>
                        <div className="text-xs text-slate-500 flex gap-2 flex-wrap">
                          {r.isSerial && <span className="font-mono">SN: {r.serial}</span>}
                          {r.sku && <span className="font-mono text-slate-400">{r.sku}</span>}
                          {r.signedTo && <span className="text-blue-600">🪖 {r.signedTo}</span>}
                        </div>
                      </div>
                      <Badge className={r.isLoss ? "bg-rose-100 text-rose-700" : r.isWear ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}>
                        {r.statusName}
                      </Badge>
                      <span className="text-sm font-bold w-12 text-center">{r.quantity}</span>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
