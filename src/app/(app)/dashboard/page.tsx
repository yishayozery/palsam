import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader, StatCard, Badge } from "@/components/ui";
import { TRANSFER_TYPE } from "@/lib/labels";
import { WAREHOUSE_TYPE_SHORT, WAREHOUSE_TYPE_ICON } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ warehouse?: string }>;
}) {
  const user = await requireUser();
  if (user.role === "SUPER_ADMIN") redirect("/admin/battalions");
  const bId = user.battalionId!;
  const { warehouse: selectedWh = "" } = await searchParams;

  // === סקופ מחסנים ===
  // קצין מחסן רואה אוטומטית רק את המחסנים שלו; מפ"מ רואה הכל עם אפשרות סינון.
  const isWarehouseManager = user.role === "WAREHOUSE_MANAGER";
  const allWarehouses = await prisma.holder.findMany({
    where: {
      battalionId: bId, kind: "WAREHOUSE", active: true,
      ...(isWarehouseManager && user.holderIds?.length ? { id: { in: user.holderIds } } : {}),
    },
    orderBy: { name: "asc" },
  });
  const scopedHolderIds = selectedWh
    ? allWarehouses.filter((h) => h.id === selectedWh).map((h) => h.id)
    : allWarehouses.map((h) => h.id);

  const holderScope = scopedHolderIds.length > 0 ? { currentHolderId: { in: scopedHolderIds } } : {};
  const stockHolderScope = scopedHolderIds.length > 0 ? { holderId: { in: scopedHolderIds } } : {};

  const [
    pendingTransfers,
    openGaps,
    wearUnits,
    lossUnits,
    serialTotal,
    signedSerial,
    companies,
    quantityStock,
  ] = await Promise.all([
    prisma.transfer.count({
      where: {
        battalionId: bId, status: "PENDING",
        ...(scopedHolderIds.length > 0 ? { OR: [{ fromHolderId: { in: scopedHolderIds } }, { toHolderId: { in: scopedHolderIds } }] } : {}),
      },
    }),
    prisma.discrepancy.count({
      where: {
        battalionId: bId, status: "OPEN",
        ...(scopedHolderIds.length > 0 ? { holderId: { in: scopedHolderIds } } : {}),
      },
    }),
    prisma.serialUnit.count({ where: { battalionId: bId, status: { isWear: true }, ...holderScope } }),
    prisma.serialUnit.count({ where: { battalionId: bId, status: { isLoss: true }, ...holderScope } }),
    prisma.serialUnit.count({ where: { battalionId: bId, ...holderScope } }),
    prisma.serialUnit.count({ where: { battalionId: bId, signedSoldierId: { not: null }, ...holderScope } }),
    prisma.holder.findMany({ where: { battalionId: bId, kind: "COMPANY", active: true } }),
    prisma.stockBalance.aggregate({ _sum: { quantity: true }, where: { battalionId: bId, ...stockHolderScope } }),
  ]);

  // === תקולים לפי מחסן (להחלטה: לתקן, להחזיר לחטיבה, או להוריד מהמלאי) ===
  const defectivePerWarehouse = await Promise.all(
    allWarehouses.map(async (w) => {
      const [serialWear, serialLoss, qtyWear] = await Promise.all([
        prisma.serialUnit.count({ where: { battalionId: bId, currentHolderId: w.id, status: { isWear: true } } }),
        prisma.serialUnit.count({ where: { battalionId: bId, currentHolderId: w.id, status: { isLoss: true } } }),
        prisma.stockBalance.aggregate({
          _sum: { quantity: true },
          where: { battalionId: bId, holderId: w.id, status: { isWear: true } },
        }),
      ]);
      return {
        id: w.id,
        name: w.name,
        type: w.warehouseType,
        serialWear,
        serialLoss,
        qtyWear: qtyWear._sum.quantity ?? 0,
        total: serialWear + serialLoss + (qtyWear._sum.quantity ?? 0),
      };
    }),
  );
  const defectiveTotal = defectivePerWarehouse.reduce((s, r) => s + r.total, 0);

  // === תמונת מצב פלוגתית ===
  const companyRows = await Promise.all(
    companies.map(async (c) => {
      const allocated = await prisma.serialUnit.count({ where: { currentHolderId: c.id } });
      const signed = await prisma.serialUnit.count({
        where: { currentHolderId: c.id, signedSoldierId: { not: null } },
      });
      return { name: c.name, allocated, signed, free: allocated - signed };
    }),
  );

  const accuracy = serialTotal === 0 ? 100 : Math.max(0, Math.round((1 - openGaps / serialTotal) * 100));

  const recentTransfers = await prisma.transfer.findMany({
    where: {
      battalionId: bId,
      ...(scopedHolderIds.length > 0 ? { OR: [{ fromHolderId: { in: scopedHolderIds } }, { toHolderId: { in: scopedHolderIds } }] } : {}),
    },
    take: 6,
    orderBy: { createdAt: "desc" },
    include: { fromHolder: true, toHolder: true, toSoldier: true },
  });

  const headerHint = isWarehouseManager
    ? `המחסנים שלך${selectedWh ? ` — מסונן ל-${allWarehouses.find((h) => h.id === selectedWh)?.name}` : ""}`
    : selectedWh
    ? `מסונן ל-${allWarehouses.find((h) => h.id === selectedWh)?.name}`
    : "תמונת מצב לוגיסטית בזמן אמת";

  return (
    <div>
      <PageHeader
        title={`שלום, ${user.fullName}`}
        subtitle={headerHint}
        action={
          allWarehouses.length > 1 ? (
            <form className="flex items-center gap-2">
              <label className="text-xs text-slate-500">סינון מחסן:</label>
              <select
                name="warehouse"
                defaultValue={selectedWh}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm bg-white"
              >
                <option value="">כל המחסנים</option>
                {allWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.warehouseType ? WAREHOUSE_TYPE_ICON[w.warehouseType] + " " : ""}
                    {w.name}
                  </option>
                ))}
              </select>
              <button className="bg-slate-800 text-white rounded-lg px-3 py-1.5 text-sm hover:bg-slate-900">
                סנן
              </button>
              {selectedWh && (
                <Link href="/dashboard" className="text-xs text-slate-500 hover:underline">נקה</Link>
              )}
            </form>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="אמינות מלאי"
          value={`${accuracy}%`}
          hint="מבוסס פערים פתוחים"
          tone={accuracy >= 95 ? "emerald" : accuracy >= 85 ? "amber" : "rose"}
        />
        <StatCard
          label="מלאי במעבר"
          value={pendingTransfers}
          hint="ממתינים לאישור קבלה"
          tone={pendingTransfers > 0 ? "amber" : "slate"}
        />
        <StatCard
          label="פערים פתוחים"
          value={openGaps}
          hint="מחייבים טיפול"
          tone={openGaps > 0 ? "rose" : "emerald"}
        />
        <StatCard
          label="פריטים בבלאי"
          value={wearUnits}
          hint={`${lossUnits} אבודים`}
          tone={wearUnits + lossUnits > 0 ? "amber" : "slate"}
        />
      </div>

      {/* === תקולים לפי מחסן === */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-800">
            תקולים לפי מחסן
            {defectiveTotal > 0 && (
              <span className="text-xs text-rose-600 font-normal mr-2">
                ({defectiveTotal} פריטים מחייבים החלטה)
              </span>
            )}
          </h2>
          <span className="text-xs text-slate-400">בלאי / אבוד / כמותי-תקול</span>
        </div>
        {defectivePerWarehouse.length === 0 ? (
          <p className="text-sm text-slate-400">לא הוגדרו מחסנים</p>
        ) : (
          <table className="w-full text-sm text-right">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-200">
                <th className="text-right pb-2">מחסן</th>
                <th className="pb-2 text-center">סריאלי - בלאי</th>
                <th className="pb-2 text-center">סריאלי - אבוד</th>
                <th className="pb-2 text-center">כמותי - תקול</th>
                <th className="pb-2 text-center">סה״כ</th>
                <th className="pb-2 text-left pl-2">פעולה</th>
              </tr>
            </thead>
            <tbody>
              {defectivePerWarehouse.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="py-2 font-medium">
                    {r.type ? WAREHOUSE_TYPE_ICON[r.type] + " " : ""}
                    {r.name}
                    {r.type && (
                      <span className="text-xs text-slate-400 mr-2">({WAREHOUSE_TYPE_SHORT[r.type]})</span>
                    )}
                  </td>
                  <td className="py-2 text-center">
                    {r.serialWear > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-7 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-bold">
                        {r.serialWear}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="py-2 text-center">
                    {r.serialLoss > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-7 rounded-full bg-rose-100 text-rose-800 px-2 py-0.5 text-xs font-bold">
                        {r.serialLoss}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="py-2 text-center">
                    {r.qtyWear > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-7 rounded-full bg-orange-100 text-orange-800 px-2 py-0.5 text-xs font-bold">
                        {r.qtyWear}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="py-2 text-center font-bold">
                    {r.total > 0 ? r.total : <span className="text-emerald-600">✓</span>}
                  </td>
                  <td className="py-2 text-left pl-2">
                    {r.total > 0 ? (
                      <Link
                        href={`/inventory?holder=${r.id}&defective=1`}
                        className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                      >
                        צפה ←
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-300">תקין</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="font-bold text-slate-800 mb-4">תמונת מצב פלוגתית</h2>
          {companyRows.length === 0 ? (
            <p className="text-sm text-slate-400">אין פלוגות מוגדרות</p>
          ) : (
            <table className="w-full text-sm text-right">
              <thead>
                <tr className="text-xs text-slate-500">
                  <th className="text-right pb-2">פלוגה</th>
                  <th className="pb-2">מוקצה</th>
                  <th className="pb-2">חתום על חיילים</th>
                  <th className="pb-2">פנוי בארון</th>
                </tr>
              </thead>
              <tbody>
                {companyRows.map((r) => (
                  <tr key={r.name} className="border-t border-slate-100">
                    <td className="py-2 font-medium">{r.name}</td>
                    <td className="py-2 text-center">{r.allocated}</td>
                    <td className="py-2 text-center text-blue-600">{r.signed}</td>
                    <td className="py-2 text-center text-emerald-600">{r.free}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 flex gap-4">
            <span>סה״כ פריטים סריאליים: {serialTotal}</span>
            <span>חתומים: {signedSerial}</span>
            <span>מלאי כמותי: {quantityStock._sum.quantity ?? 0}</span>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-bold text-slate-800 mb-4">פעולות אחרונות</h2>
          {recentTransfers.length === 0 ? (
            <p className="text-sm text-slate-400">אין פעולות אחרונות</p>
          ) : (
            <ul className="space-y-2">
              {recentTransfers.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between text-sm border-b border-slate-100 pb-2"
                >
                  <div>
                    <div className="font-medium">{TRANSFER_TYPE[t.type]}</div>
                    <div className="text-xs text-slate-400">
                      {t.fromHolder?.name ?? "חטיבה"} ←{" "}
                      {t.toSoldier?.fullName ?? t.toHolder?.name ?? "חטיבה"}
                    </div>
                  </div>
                  <Badge
                    className={
                      t.status === "PENDING"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-emerald-100 text-emerald-800"
                    }
                  >
                    {t.status === "PENDING" ? "ממתין" : "הושלם"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
