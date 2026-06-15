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

  const totals = {
    totalItems: serialUnits.length + balances.reduce((s, b) => s + b.quantity, 0),
    defective: serialUnits.filter((u) => u.status.isWear || u.status.isLoss).length
              + balances.filter((b) => b.status.isWear || b.status.isLoss).reduce((s, b) => s + b.quantity, 0),
    signedOnSoldiers: serialUnits.filter((u) => u.signedSoldierId).length,
  };

  // 🆕 טבלת תקן - כל פריט שיש לו בסיס > 0 או שיש לו כמות נוכחית
  type StatusBreakdown = { statusName: string; qty: number; isWear: boolean; isLoss: boolean };
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
    statusBreakdown: Map<string, StatusBreakdown>;
    signedOnSoldiers: number; // כמה יחידות חתומות על חיילים
    serialNumbers: string[]; // SNs (אם יש)
  };
  const standardMap = new Map<string, StandardRow>();
  const makeRow = (itemTypeId: string, sample: { name: string; sku: string | null; unit: string; category: { name: string; warehouseType: string | null } | null }): StandardRow => ({
    itemTypeId,
    itemName: sample.name,
    sku: sample.sku,
    unit: sample.unit,
    categoryName: sample.category?.name ?? null,
    warehouseType: sample.category?.warehouseType ?? null,
    baseline: 0,
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
  for (const [itemTypeId, r] of standardMap.entries()) {
    r.current = totalsMap.get(itemTypeId) ?? 0;
    r.diff = r.current - r.baseline;
  }
  const standardRows = Array.from(standardMap.values()).sort((a, b) =>
    a.itemName.localeCompare(b.itemName)
  );
  const shortage = standardRows.filter((r) => r.diff < 0); // חסר
  const surplus = standardRows.filter((r) => r.diff > 0 && r.baseline > 0); // יש מה לזכות (עודף מעל תקן)
  const balanced = standardRows.filter((r) => r.diff === 0 && r.baseline > 0); // מאוזן בדיוק לתקן

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

      {/* 📌 טבלה מאוחדת: פריט × תקן × יש × פירוט סטטוסים × חתום */}
      {standardRows.length === 0 ? (
        <Card><EmptyState>אין מלאי בפלוגה. מקבלים ציוד דרך החתמת פלוגה ע״י קצין המחסן.</EmptyState></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center gap-3 flex-wrap">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">
              <span className="text-xl">📦</span>
              ציוד הפלוגה
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
                  <th className="text-right p-2 font-medium text-xs text-slate-600">פירוט סטטוסים</th>
                  <th className="text-right p-2 font-medium text-xs text-slate-600">🪖 חתום</th>
                  <th className="text-right p-2 font-medium text-xs text-slate-600">הפרש מתקן</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {standardRows.map((r) => {
                  const rowClass = r.diff < 0 ? "bg-rose-50" : r.diff > 0 && r.baseline > 0 ? "bg-emerald-50/50" : "";
                  const whIcon = r.warehouseType ? (WAREHOUSE_TYPE_ICON[r.warehouseType as keyof typeof WAREHOUSE_TYPE_ICON] ?? "📦") : "📦";
                  const breakdown = Array.from(r.statusBreakdown.values()).sort((a, b) => b.qty - a.qty);
                  const allOK = breakdown.length === 1 && !breakdown[0].isWear && !breakdown[0].isLoss;
                  return (
                    <tr key={r.itemTypeId} className={rowClass}>
                      <td className="p-2">
                        <div className="font-medium flex items-center gap-1.5">
                          <span>{whIcon}</span>
                          <span>{r.itemName}</span>
                        </div>
                        {(r.sku || r.serialNumbers.length > 0) && (
                          <div className="text-[11px] text-slate-500 mt-0.5 flex gap-2 flex-wrap">
                            {r.sku && <span className="font-mono">{r.sku}</span>}
                            {r.serialNumbers.length > 0 && r.serialNumbers.length <= 3 && (
                              <span className="font-mono text-slate-400" title={r.serialNumbers.join(", ")}>
                                SN: {r.serialNumbers.slice(0, 3).join(", ")}
                              </span>
                            )}
                            {r.serialNumbers.length > 3 && (
                              <span className="font-mono text-slate-400" title={r.serialNumbers.join(", ")}>
                                {r.serialNumbers.length} סריאליים
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-xs text-slate-600">
                        {r.categoryName ?? "—"}
                        {r.warehouseType && (
                          <div className="text-[10px] text-slate-400">
                            {WAREHOUSE_TYPE_SHORT[r.warehouseType as keyof typeof WAREHOUSE_TYPE_SHORT] ?? r.warehouseType}
                          </div>
                        )}
                      </td>
                      <td className="p-2 font-mono">
                        <span className="bg-slate-100 rounded px-2 py-0.5">{r.baseline}</span>
                        <span className="text-[10px] text-slate-400 mr-1">{r.unit}</span>
                      </td>
                      <td className="p-2 font-mono">
                        <span className="bg-blue-50 text-blue-700 rounded px-2 py-0.5 font-bold">{r.current}</span>
                        <span className="text-[10px] text-slate-400 mr-1">{r.unit}</span>
                      </td>
                      <td className="p-2">
                        {allOK ? (
                          <Badge className="bg-emerald-100 text-emerald-700">{breakdown[0].statusName}</Badge>
                        ) : breakdown.length === 0 ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          <div className="flex gap-1 flex-wrap">
                            {breakdown.map((b, i) => (
                              <Badge key={i} className={
                                b.isLoss ? "bg-rose-100 text-rose-700" :
                                b.isWear ? "bg-amber-100 text-amber-700" :
                                "bg-emerald-100 text-emerald-700"
                              }>
                                {b.qty} {b.statusName}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-xs">
                        {r.signedOnSoldiers > 0 ? (
                          <span className="text-blue-700 font-medium">{r.signedOnSoldiers}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-2">
                        {r.diff < 0 && r.baseline > 0 && (
                          <Badge className="bg-rose-100 text-rose-700">⚠️ חסר {Math.abs(r.diff)}</Badge>
                        )}
                        {r.diff === 0 && r.baseline > 0 && (
                          <Badge className="bg-emerald-100 text-emerald-700">✓ מאוזן</Badge>
                        )}
                        {r.diff > 0 && r.baseline > 0 && (
                          <Badge className="bg-emerald-100 text-emerald-700">↩️ {r.diff} לזיכוי</Badge>
                        )}
                        {r.baseline === 0 && (
                          <Badge className="bg-slate-100 text-slate-600">ללא תקן</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-2.5 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-600">
            💡 <b>תקן</b> = הכמות שאמורה להישאר אצלכם גם אחרי תעסוקה (קובע מפ&quot;ם). <b>יש</b> = הכמות הכוללת בפלוגה (מלאי + חתום על חיילים).
            פירוט יחידני (SN, חייל, מיקום) — בעמוד <b>📍 מיקומי ציוד</b>.
          </div>
        </Card>
      )}

    </div>
  );
}
