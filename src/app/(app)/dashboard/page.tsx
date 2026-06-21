import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader, StatCard, Badge } from "@/components/ui";
import { TRANSFER_TYPE } from "@/lib/labels";
import { WAREHOUSE_TYPE_SHORT, WAREHOUSE_TYPE_ICON } from "@/lib/rbac";
import CompanyRepDashboard from "./CompanyRepDashboard";

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

  // ====== דשבורד רס"פ פלוגה — תצוגה ייעודית ======
  if (user.role === "COMPANY_REP" && user.holderId) {
    return <CompanyRepDashboard userName={user.fullName} bId={bId} companyId={user.holderId} />;
  }

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
    expiringSoon,
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
    prisma.serialUnit.count({ where: { battalionId: bId, dischargedAt: null, status: { isWear: true }, ...holderScope } }),
    prisma.serialUnit.count({ where: { battalionId: bId, dischargedAt: null, status: { isLoss: true }, ...holderScope } }),
    prisma.serialUnit.count({ where: { battalionId: bId, dischargedAt: null, ...holderScope } }),
    prisma.serialUnit.count({ where: { battalionId: bId, dischargedAt: null, signedSoldierId: { not: null }, ...holderScope } }),
    prisma.holder.findMany({ where: { battalionId: bId, kind: "COMPANY", active: true } }),
    prisma.stockBalance.aggregate({ _sum: { quantity: true }, where: { battalionId: bId, ...stockHolderScope } }),
    // פריטים עם תפוגה — 30 הקרובים ביותר (מהכי קרוב לרחוק)
    prisma.serialUnit.findMany({
      where: { battalionId: bId, dischargedAt: null, expiryDate: { not: null }, ...holderScope },
      include: { itemType: { select: { name: true } }, currentHolder: { select: { name: true } }, status: { select: { name: true, isLoss: true } } },
      orderBy: { expiryDate: "asc" },
      take: 30,
    }),
  ]);

  // 🆕 פילוח תפוגה לטווחים: פג / 7 ימים / 30 ימים / 90 ימים
  const now = Date.now();
  const expiryBuckets = {
    expired: 0, // כבר פג
    soon7: 0, // עד 7 ימים
    soon30: 0, // 8-30 ימים
    soon90: 0, // 31-90 ימים
  };
  for (const u of expiringSoon) {
    if (!u.expiryDate) continue;
    const days = Math.round((u.expiryDate.getTime() - now) / 86_400_000);
    if (days < 0) expiryBuckets.expired++;
    else if (days <= 7) expiryBuckets.soon7++;
    else if (days <= 30) expiryBuckets.soon30++;
    else if (days <= 90) expiryBuckets.soon90++;
  }
  const expiryUrgent = expiryBuckets.expired + expiryBuckets.soon7;

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

  // === חיילים: סטטוס + מסופחים ===
  const [soldierTotal, soldierEnlisted, soldierRegistered, soldierAttached] = await Promise.all([
    prisma.soldier.count({ where: { battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] } } }),
    prisma.soldier.count({ where: { battalionId: bId, status: "ENLISTED" } }),
    prisma.soldier.count({ where: { battalionId: bId, status: "REGISTERED" } }),
    prisma.soldier.count({ where: { battalionId: bId, attached: true, status: { notIn: ["DISCHARGED", "INACTIVE"] } } }),
  ]);

  // === נוכחות: תמונת מצב להיום ===
  const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
  const todayDate = new Date(todayStr + "T00:00:00Z");
  const [attendanceStatuses, todayRecords] = await Promise.all([
    prisma.attendanceStatus.findMany({ where: { battalionId: bId, active: true }, select: { id: true, name: true, icon: true, isPresent: true } }),
    prisma.attendanceRecord.findMany({
      where: { soldier: { battalionId: bId }, date: todayDate },
      select: { soldierId: true, statusId: true },
    }),
  ]);
  const recordMap = new Map(todayRecords.map((r) => [r.soldierId, r.statusId]));
  const attPresent = todayRecords.filter((r) => attendanceStatuses.find((s) => s.id === r.statusId)?.isPresent).length;
  const attReported = todayRecords.length;
  const attUnreported = soldierTotal - attReported;
  const attAbsent = attReported - attPresent;
  const soldierCompanyList = soldierTotal > 0
    ? await prisma.soldier.findMany({
        where: { battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] } },
        select: { id: true, companyId: true },
      })
    : [];
  const companyAttendance = companies.map((c) => {
    const ids = soldierCompanyList.filter((s) => s.companyId === c.id).map((s) => s.id);
    const reported = ids.filter((id) => recordMap.has(id)).length;
    const present = ids.filter((id) => {
      const sid = recordMap.get(id);
      return sid && attendanceStatuses.find((s) => s.id === sid)?.isPresent;
    }).length;
    return { name: c.name, total: ids.length, reported, present };
  });

  const accuracy = serialTotal === 0 ? 100 : Math.max(0, Math.round((1 - openGaps / serialTotal) * 100));

  // ספירות באיחור — להתראה
  const overdueTasks = await prisma.countTask.findMany({
    where: {
      battalionId: bId,
      status: "OVERDUE",
      ...(isWarehouseManager && scopedHolderIds.length > 0
        ? { OR: [{ holderId: { in: scopedHolderIds } }, { assignedUserId: user.id }] }
        : {}),
    },
    take: 10,
    orderBy: { dueAt: "asc" },
    include: { holder: true, plan: true, assignedUser: { select: { fullName: true } } },
  });

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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
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
        <StatCard
          label="⏳ תפוגה דחופה"
          value={expiryUrgent}
          hint={expiryBuckets.expired > 0 ? `${expiryBuckets.expired} פגו · ${expiryBuckets.soon7} עד 7 ימים` : `עד 7 ימים`}
          tone={expiryBuckets.expired > 0 ? "rose" : expiryUrgent > 0 ? "amber" : "slate"}
        />
      </div>

      {/* === התראה: פג תוקף קרוב === */}
      {expiringSoon.length > 0 && (
        <Card className="p-4 mb-6 border-amber-300 bg-amber-50">
          <div className="flex items-start gap-3">
            <span className="text-3xl">⏳</span>
            <div className="flex-1">
              <h2 className="font-bold text-amber-900 mb-2 flex items-center gap-2 flex-wrap">
                פריטים בתפוגה קרובה ({expiringSoon.length})
                {expiryBuckets.expired > 0 && <span className="text-xs bg-rose-200 text-rose-900 rounded-full px-2 py-0.5">🔴 {expiryBuckets.expired} פגו</span>}
                {expiryBuckets.soon7 > 0 && <span className="text-xs bg-rose-100 text-rose-800 rounded-full px-2 py-0.5">🟠 {expiryBuckets.soon7} עד 7 ימים</span>}
                {expiryBuckets.soon30 > 0 && <span className="text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">🟡 {expiryBuckets.soon30} עד 30 ימים</span>}
                {expiryBuckets.soon90 > 0 && <span className="text-xs bg-slate-100 text-slate-700 rounded-full px-2 py-0.5">{expiryBuckets.soon90} עד 90 ימים</span>}
              </h2>
              <div className="space-y-1">
                {expiringSoon.slice(0, 8).map((u) => {
                  const days = u.expiryDate ? Math.round((u.expiryDate.getTime() - Date.now()) / 86_400_000) : null;
                  const tone = days === null ? "bg-white"
                    : days < 0 ? "bg-rose-100 border-rose-300"
                    : days <= 7 ? "bg-rose-50 border-rose-200"
                    : days <= 30 ? "bg-amber-50 border-amber-200"
                    : "bg-white border-slate-200";
                  const txt = days === null ? "—"
                    : days < 0 ? `🔴 פג לפני ${-days} ימים`
                    : days === 0 ? "🔴 היום!"
                    : days <= 7 ? `🟠 בעוד ${days} ימים`
                    : days <= 30 ? `🟡 בעוד ${days} ימים`
                    : `בעוד ${days} ימים`;
                  return (
                    <div key={u.id} className={`flex items-center justify-between text-sm rounded-lg px-3 py-1.5 border ${tone}`}>
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{(u.lotQuantity ?? 1) > 1 ? "💣" : "📦"} {u.itemType.name}</span>
                        <span className="font-mono text-xs text-slate-500">
                          {(u.lotQuantity ?? 1) > 1 ? `לוט ${u.serialNumber} × ${u.lotQuantity}` : `SN ${u.serialNumber}`}
                        </span>
                        {u.currentHolder && <span className="text-xs text-slate-500">· {u.currentHolder.name}</span>}
                      </span>
                      <span className="text-xs font-medium whitespace-nowrap">
                        {u.expiryDate?.toLocaleDateString("he-IL")} <span className="text-slate-500">· {txt}</span>
                      </span>
                    </div>
                  );
                })}
                {expiringSoon.length > 8 && (
                  <div className="text-xs text-amber-700 mt-1.5">+ עוד {expiringSoon.length - 8} פריטים — <a href="/stock/serials?sort=expiry" className="underline">הצג הכל</a></div>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* === התראה: ספירות באיחור === */}
      {overdueTasks.length > 0 && (
        <Card className="p-4 mb-6 border-rose-300 bg-rose-50">
          <div className="flex items-start gap-3">
            <span className="text-3xl">⏰</span>
            <div className="flex-1">
              <h2 className="font-bold text-rose-800 mb-2">
                ספירות מלאי באיחור ({overdueTasks.length})
              </h2>
              <div className="space-y-1">
                {overdueTasks.slice(0, 5).map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-sm bg-white rounded-lg px-3 py-1.5 border border-rose-200">
                    <span>
                      <b>{t.plan?.name ?? "ספירה"}</b>
                      <span className="text-slate-500"> · {t.holder.name}</span>
                      {t.assignedUser && <span className="text-xs text-slate-400 mr-2">אחראי: {t.assignedUser.fullName}</span>}
                    </span>
                    <span className="text-xs text-rose-600">איחור: {Math.round((Date.now() - t.dueAt.getTime()) / 60000)} דק׳</span>
                  </div>
                ))}
                {overdueTasks.length > 5 && (
                  <Link href="/counts" className="text-xs text-rose-700 hover:underline">+ עוד {overdueTasks.length - 5} ספירות באיחור</Link>
                )}
              </div>
            </div>
            <Link href="/counts" className="bg-rose-600 hover:bg-rose-700 text-white rounded-lg px-4 py-2 text-sm font-medium">
              לדוח ←
            </Link>
          </div>
        </Card>
      )}

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

      {/* === חיילים === */}
      <Card className="p-5 mb-6">
        <h2 className="font-bold text-slate-800 mb-3">חיילים</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-slate-800">{soldierTotal}</div>
            <div className="text-xs text-slate-500">פעילים</div>
          </div>
          <div className="bg-emerald-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-emerald-700">{soldierEnlisted}</div>
            <div className="text-xs text-emerald-600">מגויסים</div>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-amber-700">{soldierRegistered}</div>
            <div className="text-xs text-amber-600">רשומים (ממתינים)</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-blue-700">{soldierAttached}</div>
            <div className="text-xs text-blue-600">מסופחים לגדוד</div>
          </div>
        </div>
      </Card>

      {/* === נוכחות היום === */}
      {attendanceStatuses.length > 0 && (
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-800">📋 נוכחות היום</h2>
            <Link href="/attendance?mode=record" className="text-xs text-blue-600 hover:underline">לעמוד נוכחות ←</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-emerald-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-emerald-700">{attPresent}</div>
              <div className="text-xs text-emerald-600">נוכחים</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-amber-700">{attAbsent}</div>
              <div className="text-xs text-amber-600">חסרים</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-slate-400">{attUnreported}</div>
              <div className="text-xs text-slate-500">לא דווח</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-slate-800">{attReported}/{soldierTotal}</div>
              <div className="text-xs text-slate-500">דווחו</div>
            </div>
          </div>
          {companyAttendance.length > 0 && (
            <table className="w-full text-sm text-right">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-200">
                  <th className="text-right pb-2">פלוגה</th>
                  <th className="pb-2 text-center">נוכחים</th>
                  <th className="pb-2 text-center">חסרים</th>
                  <th className="pb-2 text-center">לא דווח</th>
                  <th className="pb-2 text-center">דווחו</th>
                </tr>
              </thead>
              <tbody>
                {companyAttendance.map((c) => (
                  <tr key={c.name} className="border-t border-slate-100">
                    <td className="py-2 font-medium">{c.name}</td>
                    <td className="py-2 text-center">
                      {c.present > 0 ? <span className="text-emerald-600 font-bold">{c.present}</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-2 text-center">
                      {c.reported - c.present > 0 ? <span className="text-amber-600 font-bold">{c.reported - c.present}</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-2 text-center">
                      {c.total - c.reported > 0 ? <span className="text-slate-400">{c.total - c.reported}</span> : <span className="text-emerald-500">✓</span>}
                    </td>
                    <td className="py-2 text-center text-xs text-slate-500">{c.reported}/{c.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

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
