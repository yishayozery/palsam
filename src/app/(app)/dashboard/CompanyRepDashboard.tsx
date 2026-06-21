import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader, StatCard, Badge } from "@/components/ui";
import { WAREHOUSE_TYPE_SHORT, WAREHOUSE_TYPE_ICON } from "@/lib/rbac";

export default async function CompanyRepDashboard({
  userName, bId, companyId,
}: {
  userName: string; bId: string; companyId: string;
}) {
  const company = await prisma.holder.findUnique({ where: { id: companyId }, select: { name: true } });

  // === מלאי הפלוגה ===
  const [serialUnits, stockBalances, soldiers, signedSerials, pendingReturns, openGaps] = await Promise.all([
    prisma.serialUnit.findMany({
      where: { battalionId: bId, currentHolderId: companyId },
      include: { itemType: { include: { category: true } }, status: true, signedSoldier: true },
    }),
    prisma.stockBalance.findMany({
      where: { battalionId: bId, holderId: companyId, quantity: { gt: 0 } },
      include: { itemType: { include: { category: true } }, status: true },
    }),
    prisma.soldier.count({ where: { battalionId: bId, companyId, status: { notIn: ["DISCHARGED", "INACTIVE"] } } }),
    prisma.serialUnit.count({
      where: { battalionId: bId, currentHolderId: companyId, signedSoldierId: { not: null } },
    }),
    prisma.transfer.count({
      where: { battalionId: bId, status: "PENDING", fromHolderId: companyId, type: "RETURN" },
    }),
    prisma.discrepancy.count({
      where: { battalionId: bId, status: "OPEN", holderId: companyId },
    }),
  ]);

  // קיבוץ פריטים לפי סוג מחסן (מהקטגוריה של הפריט)
  type GroupRow = {
    warehouseType: string | null;
    items: Map<string, { name: string; sku: string | null; total: number; signed: number; defective: number; trackingMethod: string }>;
  };
  const groups = new Map<string, GroupRow>();
  const addGroup = (wt: string | null): GroupRow => {
    const key = wt || "OTHER";
    let g = groups.get(key);
    if (!g) { g = { warehouseType: wt, items: new Map() }; groups.set(key, g); }
    return g;
  };
  for (const u of serialUnits) {
    const wt = u.itemType.category?.warehouseType ?? null;
    const g = addGroup(wt);
    const row = g.items.get(u.itemTypeId) ?? { name: u.itemType.name, sku: u.itemType.sku, total: 0, signed: 0, defective: 0, trackingMethod: u.itemType.trackingMethod };
    const cnt = u.lotQuantity ?? 1;
    row.total += cnt;
    if (u.signedSoldierId) row.signed += cnt;
    if (u.status.isWear || u.status.isLoss) row.defective += cnt;
    g.items.set(u.itemTypeId, row);
  }
  for (const b of stockBalances) {
    const wt = b.itemType.category?.warehouseType ?? null;
    const g = addGroup(wt);
    const row = g.items.get(b.itemTypeId) ?? { name: b.itemType.name, sku: b.itemType.sku, total: 0, signed: 0, defective: 0, trackingMethod: b.itemType.trackingMethod };
    row.total += b.quantity;
    if (b.status.isWear || b.status.isLoss) row.defective += b.quantity;
    g.items.set(b.itemTypeId, row);
  }

  const totalItems = Array.from(groups.values()).reduce(
    (sum, g) => sum + Array.from(g.items.values()).reduce((s, i) => s + i.total, 0), 0,
  );
  const totalDefective = Array.from(groups.values()).reduce(
    (sum, g) => sum + Array.from(g.items.values()).reduce((s, i) => s + i.defective, 0), 0,
  );

  // קבוצות לפי סדר WAREHOUSE_TYPE_SHORT
  const order = ["EQUIPMENT", "COMMS", "AMMO", "ARMORY", "VEHICLES", "MEDICAL", "GENERAL", "OTHER"];
  const sortedGroups = Array.from(groups.values()).sort((a, b) => {
    const aKey = a.warehouseType ?? "OTHER";
    const bKey = b.warehouseType ?? "OTHER";
    return order.indexOf(aKey) - order.indexOf(bKey);
  });

  return (
    <div>
      <PageHeader
        title={`שלום, ${userName}`}
        subtitle={`רס״פ פלוגה — ${company?.name ?? ""}`}
        action={
          <div className="flex gap-2">
            <Link href="/return" className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-4 py-2 text-sm font-medium">↩️ זיכוי לגדוד</Link>
            <Link href="/signatures" className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium">✍️ החתמת חייל</Link>
          </div>
        }
      />

      {/* כרטיסי סיכום */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="סה״כ פריטים בפלוגה" value={totalItems} hint={`${groups.size} סוגי מחסנים`} tone="slate" />
        <StatCard label="חתומים על חיילים" value={signedSerials} hint={`${soldiers} חיילים פעילים`} tone="blue" />
        <StatCard label="תקולים / אבודים" value={totalDefective} hint="דורשים זיכוי לגדוד" tone={totalDefective > 0 ? "amber" : "emerald"} />
        <StatCard label="פערים פתוחים" value={openGaps} hint={pendingReturns > 0 ? `${pendingReturns} זיכויים בהמתנה` : "—"} tone={openGaps > 0 ? "rose" : "emerald"} />
      </div>

      {/* טבלת ציוד לפי מחסן */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-800">הציוד בפלוגה — לפי סוג מחסן</h2>
          <span className="text-xs text-slate-400">פלוגה: {company?.name}</span>
        </div>

        {sortedGroups.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">אין פריטים בפלוגה כרגע. ציוד חדש מגיע דרך החתמה מהמחסנים הגדודיים.</p>
        ) : (
          <div className="space-y-5">
            {sortedGroups.map((g) => {
              const key = g.warehouseType ?? "OTHER";
              const label = key === "OTHER" ? "ללא קטגוריה" : (WAREHOUSE_TYPE_SHORT[key as keyof typeof WAREHOUSE_TYPE_SHORT] || key);
              const icon = key === "OTHER" ? "📦" : (WAREHOUSE_TYPE_ICON[key as keyof typeof WAREHOUSE_TYPE_ICON] || "📦");
              const itemsArr = Array.from(g.items.values()).sort((a, b) => b.total - a.total);
              const groupTotal = itemsArr.reduce((s, i) => s + i.total, 0);
              const groupDefective = itemsArr.reduce((s, i) => s + i.defective, 0);

              return (
                <div key={key} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2.5 flex items-center justify-between border-b border-slate-200">
                    <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                      <span className="text-xl">{icon}</span>
                      {label}
                      <span className="text-xs text-slate-500 font-normal">({itemsArr.length} סוגי פריט)</span>
                    </h3>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-white border border-slate-200 text-slate-700">{groupTotal} סה״כ</Badge>
                      {groupDefective > 0 && <Badge className="bg-amber-100 text-amber-700">{groupDefective} תקולים</Badge>}
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="text-xs text-slate-500">
                      <tr>
                        <th className="text-right p-2">פריט</th>
                        <th className="text-center p-2">מק״ט</th>
                        <th className="text-center p-2">סה״כ</th>
                        <th className="text-center p-2">חתום</th>
                        <th className="text-center p-2">תקול</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsArr.map((i) => (
                        <tr key={i.name} className="border-t border-slate-100">
                          <td className="p-2 font-medium">{i.name}</td>
                          <td className="p-2 text-center font-mono text-xs text-slate-400">{i.sku ?? "—"}</td>
                          <td className="p-2 text-center font-bold">{i.total}</td>
                          <td className="p-2 text-center text-blue-600">{i.signed > 0 ? i.signed : "—"}</td>
                          <td className="p-2 text-center">
                            {i.defective > 0 ? <span className="text-amber-600 font-bold">{i.defective}</span> : <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
