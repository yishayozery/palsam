import Link from "next/link";
import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { WAREHOUSE_TYPE_SHORT, WAREHOUSE_TYPE_ICON } from "@/lib/rbac";
import ReturnModal from "./ReturnModal";

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

  // כל הפריטים שהפלוגה חתומה עליהם (currentHolderId = company)
  const [serialUnits, balances, statuses] = await Promise.all([
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
          <ReturnModal
            serialUnits={serialUnits.map((u) => ({
              id: u.id, itemTypeId: u.itemTypeId, itemName: u.itemType.name, sku: u.itemType.sku,
              serial: u.serialNumber, lotQuantity: u.lotQuantity,
              signedTo: u.signedSoldier?.fullName ?? null,
              statusName: u.status.name, statusId: u.statusId, isWear: u.status.isWear, isLoss: u.status.isLoss,
            }))}
            balances={balances.map((b) => ({
              itemTypeId: b.itemTypeId, itemName: b.itemType.name, unit: b.itemType.unit,
              statusId: b.statusId, statusName: b.status.name,
              isWear: b.status.isWear, isLoss: b.status.isLoss,
              quantity: b.quantity,
            }))}
            statuses={statuses.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault, isWear: s.isWear, isLoss: s.isLoss }))}
          />
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
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
      </div>

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
