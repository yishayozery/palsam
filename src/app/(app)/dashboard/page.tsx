import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader, Badge } from "@/components/ui";
import { TRANSFER_TYPE } from "@/lib/labels";
import { WAREHOUSE_TYPE_SHORT, WAREHOUSE_TYPE_ICON } from "@/lib/rbac";
import CompanyRepDashboard from "./CompanyRepDashboard";

export const dynamic = "force-dynamic";

function AlertCard({ icon, title, count, tone, href, children }: {
  icon: string; title: string; count: number; tone: "rose" | "amber" | "blue";
  href?: string; children?: React.ReactNode;
}) {
  const bg = tone === "rose" ? "bg-rose-50 border-rose-300" : tone === "amber" ? "bg-amber-50 border-amber-300" : "bg-blue-50 border-blue-300";
  const text = tone === "rose" ? "text-rose-800" : tone === "amber" ? "text-amber-800" : "text-blue-800";
  return (
    <Card className={`p-4 ${bg}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className={`font-bold text-sm ${text} flex items-center gap-2`}>
            {title}
            <span className={`text-xs rounded-full px-2 py-0.5 font-bold ${tone === "rose" ? "bg-rose-200 text-rose-900" : tone === "amber" ? "bg-amber-200 text-amber-900" : "bg-blue-200 text-blue-900"}`}>
              {count}
            </span>
          </h3>
          {children}
        </div>
        {href && (
          <Link href={href} className={`text-xs ${text} hover:underline shrink-0 whitespace-nowrap`}>
            טפל ←
          </Link>
        )}
      </div>
    </Card>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: string }) {
  const color = tone === "rose" ? "text-rose-700" : tone === "amber" ? "text-amber-700" : tone === "emerald" ? "text-emerald-700" : tone === "blue" ? "text-blue-700" : "text-slate-800";
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ warehouse?: string }>;
}) {
  const user = await requireUser();
  if (user.isSuperAdmin) redirect("/admin/battalions");
  const bId = user.battalionId!;
  const { warehouse: selectedWh = "" } = await searchParams;

  if (user.role === "COMPANY_REP" && user.holderId) {
    return <CompanyRepDashboard userName={user.fullName} bId={bId} companyId={user.holderId} />;
  }

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

  const companies = await prisma.holder.findMany({ where: { battalionId: bId, kind: "COMPANY", active: true }, orderBy: { name: "asc" } });

  // ========== שליפות מקביליות ==========
  const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
  const todayDate = new Date(todayStr + "T00:00:00Z");

  const [
    pendingTransfers,
    openGaps,
    wearUnits,
    lossUnits,
    serialTotal,
    signedSerial,
    quantityStock,
    expiringSoon,
    overdueTasks,
    attachmentRequests,
    soldierTotal,
    soldierEnlisted,
    soldierRegistered,
    soldierAttached,
    attendanceStatuses,
    todayRecords,
    weaponsTotal,
    weaponsApproved,
    weaponsAgreementSigned,
    armoryTestDone,
    recentTransfers,
    activeScheduleEvents,
    todayDispatches,
  ] = await Promise.all([
    prisma.transfer.count({
      where: { battalionId: bId, status: "PENDING", ...(scopedHolderIds.length > 0 ? { OR: [{ fromHolderId: { in: scopedHolderIds } }, { toHolderId: { in: scopedHolderIds } }] } : {}) },
    }),
    prisma.discrepancy.count({
      where: { battalionId: bId, status: "OPEN", ...(scopedHolderIds.length > 0 ? { holderId: { in: scopedHolderIds } } : {}) },
    }),
    prisma.serialUnit.count({ where: { battalionId: bId, dischargedAt: null, status: { isWear: true }, ...holderScope } }),
    prisma.serialUnit.count({ where: { battalionId: bId, dischargedAt: null, status: { isLoss: true }, ...holderScope } }),
    prisma.serialUnit.count({ where: { battalionId: bId, dischargedAt: null, ...holderScope } }),
    prisma.serialUnit.count({ where: { battalionId: bId, dischargedAt: null, signedSoldierId: { not: null }, ...holderScope } }),
    prisma.stockBalance.aggregate({ _sum: { quantity: true }, where: { battalionId: bId, ...stockHolderScope } }),
    prisma.serialUnit.findMany({
      where: { battalionId: bId, dischargedAt: null, expiryDate: { not: null }, ...holderScope },
      include: { itemType: { select: { name: true } }, currentHolder: { select: { name: true } } },
      orderBy: { expiryDate: "asc" },
      take: 20,
    }),
    prisma.countTask.findMany({
      where: { battalionId: bId, status: "OVERDUE", ...(isWarehouseManager && scopedHolderIds.length > 0 ? { OR: [{ holderId: { in: scopedHolderIds } }, { assignedUserId: user.id }] } : {}) },
      take: 10, orderBy: { dueAt: "asc" },
      include: { holder: true, plan: true, assignedUser: { select: { fullName: true } } },
    }),
    prisma.attachmentRequest.count({ where: { battalionId: bId, status: { notIn: ["APPROVED", "REJECTED"] } } }),
    prisma.soldier.count({ where: { battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] } } }),
    prisma.soldier.count({ where: { battalionId: bId, status: "ENLISTED" } }),
    prisma.soldier.count({ where: { battalionId: bId, status: "REGISTERED" } }),
    prisma.soldier.count({ where: { battalionId: bId, attached: true, status: { notIn: ["DISCHARGED", "INACTIVE"] } } }),
    prisma.attendanceStatus.findMany({ where: { battalionId: bId, active: true }, select: { id: true, name: true, icon: true, isPresent: true } }),
    prisma.attendanceRecord.findMany({
      where: { soldier: { battalionId: bId }, date: todayDate },
      select: { soldierId: true, statusId: true },
    }),
    // כשירות נשק — 3 שלבים
    prisma.soldier.count({ where: { battalionId: bId, status: "ENLISTED" } }),
    prisma.soldier.count({ where: { battalionId: bId, status: "ENLISTED", weaponsApprovedAt: { not: null } } }),
    prisma.soldier.count({ where: { battalionId: bId, status: "ENLISTED", weaponsAgreementSignedAt: { not: null } } }),
    prisma.soldier.count({ where: { battalionId: bId, status: "ENLISTED", armoryTestProofAt: { not: null } } }),
    prisma.transfer.findMany({
      where: { battalionId: bId, ...(scopedHolderIds.length > 0 ? { OR: [{ fromHolderId: { in: scopedHolderIds } }, { toHolderId: { in: scopedHolderIds } }] } : {}) },
      take: 5, orderBy: { createdAt: "desc" },
      include: { fromHolder: true, toHolder: true, toSoldier: true },
    }),
    prisma.scheduleEvent.findMany({
      where: { battalionId: bId, active: true, endDate: { gte: todayDate } },
      orderBy: { startDate: "asc" },
      take: 5,
      include: { _count: { select: { forces: true } } },
    }),
    prisma.vehicleAssignment.findMany({
      where: { battalionId: bId, missionDate: todayDate },
      include: { vehicleSerialUnit: { select: { serialNumber: true, itemType: { select: { name: true } } } }, soldiers: { include: { soldier: { select: { fullName: true } } } } },
      take: 10,
    }),
  ]);

  // === נוכחות ===
  const recordMap = new Map(todayRecords.map((r) => [r.soldierId, r.statusId]));
  const attPresent = todayRecords.filter((r) => attendanceStatuses.find((s) => s.id === r.statusId)?.isPresent).length;
  const attReported = todayRecords.length;
  const attUnreported = soldierTotal - attReported;
  const attAbsent = attReported - attPresent;
  const attPct = soldierTotal > 0 ? Math.round((attPresent / soldierTotal) * 100) : 0;

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
    return { name: c.name, total: ids.length, reported, present, absent: reported - present, unreported: ids.length - reported };
  });

  // === תפוגה ===
  const now = Date.now();
  const expiryBuckets = { expired: 0, soon7: 0, soon30: 0 };
  for (const u of expiringSoon) {
    if (!u.expiryDate) continue;
    const days = Math.round((u.expiryDate.getTime() - now) / 86_400_000);
    if (days < 0) expiryBuckets.expired++;
    else if (days <= 7) expiryBuckets.soon7++;
    else if (days <= 30) expiryBuckets.soon30++;
  }
  const expiryUrgent = expiryBuckets.expired + expiryBuckets.soon7;

  // === ציוד פלוגתי ===
  const companyRows = await Promise.all(
    companies.map(async (c) => {
      const [allocated, signed] = await Promise.all([
        prisma.serialUnit.count({ where: { currentHolderId: c.id } }),
        prisma.serialUnit.count({ where: { currentHolderId: c.id, signedSoldierId: { not: null } } }),
      ]);
      return { name: c.name, allocated, signed, free: allocated - signed };
    }),
  );

  // === תקולים ===
  const defectivePerWarehouse = await Promise.all(
    allWarehouses.map(async (w) => {
      const [serialWear, serialLoss, qtyWear] = await Promise.all([
        prisma.serialUnit.count({ where: { battalionId: bId, currentHolderId: w.id, status: { isWear: true } } }),
        prisma.serialUnit.count({ where: { battalionId: bId, currentHolderId: w.id, status: { isLoss: true } } }),
        prisma.stockBalance.aggregate({ _sum: { quantity: true }, where: { battalionId: bId, holderId: w.id, status: { isWear: true } } }),
      ]);
      return { id: w.id, name: w.name, type: w.warehouseType, serialWear, serialLoss, qtyWear: qtyWear._sum.quantity ?? 0, total: serialWear + serialLoss + (qtyWear._sum.quantity ?? 0) };
    }),
  );
  const defectiveTotal = defectivePerWarehouse.reduce((s, r) => s + r.total, 0);

  // === מדד אמינות ===
  const accuracy = serialTotal === 0 ? 100 : Math.max(0, Math.round((1 - openGaps / serialTotal) * 100));

  // === נשק ===
  const weaponsPendingApproval = weaponsTotal - weaponsApproved;
  const weaponsPendingAgreement = weaponsTotal - weaponsAgreementSigned;
  const weaponsPendingTest = weaponsTotal - armoryTestDone;
  const weaponsFullyReady = Math.min(weaponsApproved, weaponsAgreementSigned, armoryTestDone);
  const weaponsReadyPct = weaponsTotal > 0 ? Math.round((weaponsFullyReady / weaponsTotal) * 100) : 0;

  // === ספירת התראות ===
  const alertCount = (pendingTransfers > 0 ? 1 : 0) + (openGaps > 0 ? 1 : 0) + (expiryUrgent > 0 ? 1 : 0) + (overdueTasks.length > 0 ? 1 : 0) + (attachmentRequests > 0 ? 1 : 0) + (soldierRegistered > 0 ? 1 : 0);

  const fmt = (d: Date) => d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });

  return (
    <div>
      <PageHeader
        title={`שלום, ${user.fullName}`}
        subtitle="תמונת מצב גדודית — מעודכן עכשיו"
        action={
          allWarehouses.length > 1 ? (
            <form className="flex items-center gap-2">
              <label className="text-xs text-slate-500">מחסן:</label>
              <select name="warehouse" defaultValue={selectedWh} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm bg-white">
                <option value="">הכל</option>
                {allWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.warehouseType ? WAREHOUSE_TYPE_ICON[w.warehouseType] + " " : ""}{w.name}</option>
                ))}
              </select>
              <button className="bg-slate-800 text-white rounded-lg px-3 py-1.5 text-sm">סנן</button>
              {selectedWh && <Link href="/dashboard" className="text-xs text-slate-500 hover:underline">נקה</Link>}
            </form>
          ) : undefined
        }
      />

      {/* ============ 1. דורש טיפול ============ */}
      {alertCount > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-slate-500 mb-2 flex items-center gap-2">
            🔔 דורש טיפול
            <span className="bg-rose-100 text-rose-700 rounded-full px-2 py-0.5 text-[10px] font-bold">{alertCount}</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {attachmentRequests > 0 && (
              <AlertCard icon="📌" title="בקשות סיפוח פתוחות" count={attachmentRequests} tone="amber" href="/roster?tab=attachments">
                <p className="text-xs text-amber-700 mt-1">חיילים ממתינים לאישור סיפוח לגדוד</p>
              </AlertCard>
            )}
            {soldierRegistered > 0 && (
              <AlertCard icon="🪖" title="חיילים ממתינים לאישור גיוס" count={soldierRegistered} tone="amber" href="/roster?status=pending">
                <p className="text-xs text-amber-700 mt-1">רשומים במערכת אך טרם אושרו — לא יכולים לחתום על ציוד</p>
              </AlertCard>
            )}
            {pendingTransfers > 0 && (
              <AlertCard icon="📥" title="מסירות ממתינות לאישור" count={pendingTransfers} tone="amber" href="/transfers">
                <p className="text-xs text-amber-700 mt-1">ציוד במעבר שלא אושרה קבלתו</p>
              </AlertCard>
            )}
            {openGaps > 0 && (
              <AlertCard icon="⚠️" title="פערי מלאי פתוחים" count={openGaps} tone="rose" href="/gaps">
                <p className="text-xs text-rose-700 mt-1">סטיות שנמצאו בספירות ומחייבות הכרעה</p>
              </AlertCard>
            )}
            {expiryUrgent > 0 && (
              <AlertCard icon="⏳" title="פריטים בתפוגה דחופה" count={expiryUrgent} tone="rose" href="/stock/serials?sort=expiry">
                <p className="text-xs text-rose-700 mt-1">
                  {expiryBuckets.expired > 0 && <span className="font-bold">{expiryBuckets.expired} פגו · </span>}
                  {expiryBuckets.soon7} ב-7 ימים הקרובים
                </p>
              </AlertCard>
            )}
            {overdueTasks.length > 0 && (
              <AlertCard icon="⏰" title="ספירות מלאי באיחור" count={overdueTasks.length} tone="rose" href="/counts">
                <div className="mt-1 space-y-0.5">
                  {overdueTasks.slice(0, 3).map((t) => (
                    <div key={t.id} className="text-xs text-rose-700">{t.plan?.name ?? "ספירה"} · {t.holder.name}</div>
                  ))}
                </div>
              </AlertCard>
            )}
          </div>
        </div>
      )}

      {/* ============ 2. כוח אדם ============ */}
      <div className="mb-6">
        <h2 className="text-sm font-bold text-slate-500 mb-2">👥 כוח אדם</h2>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
          <Metric label="חיילים פעילים" value={soldierTotal} />
          <Metric label="מגויסים" value={soldierEnlisted} tone="emerald" />
          <Metric label="ממתינים" value={soldierRegistered} tone={soldierRegistered > 0 ? "amber" : undefined} />
          <Metric label="מסופחים" value={soldierAttached} tone="blue" />
          <Metric label="נוכחות היום" value={`${attPct}%`} sub={`${attPresent}/${soldierTotal}`} tone={attPct >= 80 ? "emerald" : attPct >= 50 ? "amber" : "rose"} />
          <Metric label="לא דווח" value={attUnreported} tone={attUnreported > 0 ? "amber" : "emerald"} sub={attUnreported === 0 ? "✓ הכל דווח" : undefined} />
        </div>

        {/* נוכחות לפי פלוגה */}
        {companyAttendance.length > 0 && attendanceStatuses.length > 0 && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-600">📋 נוכחות לפי פלוגה</h3>
              <Link href="/attendance?mode=record" className="text-[10px] text-blue-600 hover:underline">מלא נוכחות ←</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {companyAttendance.map((c) => {
                const pct = c.total > 0 ? Math.round((c.present / c.total) * 100) : 0;
                return (
                  <div key={c.name} className="flex items-center gap-3 bg-slate-50 rounded-lg p-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-700 truncate">{c.name}</div>
                      <div className="flex gap-3 text-[10px] text-slate-500 mt-0.5">
                        <span className="text-emerald-600">{c.present} נוכחים</span>
                        {c.absent > 0 && <span className="text-amber-600">{c.absent} חסרים</span>}
                        {c.unreported > 0 && <span className="text-slate-400">{c.unreported} לא דווח</span>}
                      </div>
                    </div>
                    <div className={`text-lg font-bold ${pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-rose-600"}`}>
                      {pct}%
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      {/* ============ 3. כשירות נשק ============ */}
      <div className="mb-6">
        <h2 className="text-sm font-bold text-slate-500 mb-2">🔫 כשירות נשק</h2>
        <Card className="p-4">
          <div className="flex items-center gap-4 mb-3">
            <div className={`text-3xl font-bold ${weaponsReadyPct >= 80 ? "text-emerald-600" : weaponsReadyPct >= 50 ? "text-amber-600" : "text-rose-600"}`}>
              {weaponsReadyPct}%
            </div>
            <div>
              <div className="text-sm font-bold text-slate-700">כשירים לנשיאת נשק</div>
              <div className="text-xs text-slate-500">{weaponsFullyReady} מתוך {weaponsTotal} חיילים מגויסים עברו את כל 3 השלבים</div>
            </div>
            <Link href="/armory-approvals" className="mr-auto text-xs text-blue-600 hover:underline">פרטים ←</Link>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className={`rounded-lg p-2.5 text-center ${weaponsPendingApproval > 0 ? "bg-amber-50 border border-amber-200" : "bg-emerald-50 border border-emerald-200"}`}>
              <div className={`text-lg font-bold ${weaponsPendingApproval > 0 ? "text-amber-700" : "text-emerald-600"}`}>
                {weaponsApproved}/{weaponsTotal}
              </div>
              <div className="text-[10px] text-slate-600">🎖️ אישור מפקד</div>
            </div>
            <div className={`rounded-lg p-2.5 text-center ${weaponsPendingTest > 0 ? "bg-amber-50 border border-amber-200" : "bg-emerald-50 border border-emerald-200"}`}>
              <div className={`text-lg font-bold ${weaponsPendingTest > 0 ? "text-amber-700" : "text-emerald-600"}`}>
                {armoryTestDone}/{weaponsTotal}
              </div>
              <div className="text-[10px] text-slate-600">📝 מבחן ארמון</div>
            </div>
            <div className={`rounded-lg p-2.5 text-center ${weaponsPendingAgreement > 0 ? "bg-amber-50 border border-amber-200" : "bg-emerald-50 border border-emerald-200"}`}>
              <div className={`text-lg font-bold ${weaponsPendingAgreement > 0 ? "text-amber-700" : "text-emerald-600"}`}>
                {weaponsAgreementSigned}/{weaponsTotal}
              </div>
              <div className="text-[10px] text-slate-600">📜 חתימה על נוהל</div>
            </div>
          </div>
        </Card>
      </div>

      {/* ============ 4. מוכנות לוגיסטית ============ */}
      <div className="mb-6">
        <h2 className="text-sm font-bold text-slate-500 mb-2">📦 מוכנות לוגיסטית</h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <Metric label="אמינות מלאי" value={`${accuracy}%`} tone={accuracy >= 95 ? "emerald" : accuracy >= 85 ? "amber" : "rose"} sub="מבוסס פערים פתוחים" />
          <Metric label="פריטים סריאליים" value={serialTotal} sub={`${signedSerial} חתומים · ${quantityStock._sum.quantity ?? 0} כמותי`} />
          <Metric label="בלאי / אבוד" value={wearUnits + lossUnits} tone={(wearUnits + lossUnits) > 0 ? "amber" : "emerald"} sub={`${wearUnits} בלאי · ${lossUnits} אבוד`} />
          <Metric label="תקולים לטיפול" value={defectiveTotal} tone={defectiveTotal > 0 ? "rose" : "emerald"} sub="בכל המחסנים" />
        </div>

        {/* ציוד לפי פלוגה */}
        <div className="grid md:grid-cols-2 gap-3">
          <Card className="p-4">
            <h3 className="text-xs font-bold text-slate-600 mb-2">תמונת מצב פלוגתית</h3>
            {companyRows.length === 0 ? (
              <p className="text-xs text-slate-400">אין פלוגות</p>
            ) : (
              <table className="w-full text-sm text-right">
                <thead>
                  <tr className="text-[10px] text-slate-500 border-b border-slate-200">
                    <th className="text-right pb-1.5">פלוגה</th>
                    <th className="pb-1.5 text-center">מוקצה</th>
                    <th className="pb-1.5 text-center">חתום</th>
                    <th className="pb-1.5 text-center">פנוי</th>
                  </tr>
                </thead>
                <tbody>
                  {companyRows.map((r) => (
                    <tr key={r.name} className="border-t border-slate-100 text-xs">
                      <td className="py-1.5 font-medium">{r.name}</td>
                      <td className="py-1.5 text-center">{r.allocated}</td>
                      <td className="py-1.5 text-center text-blue-600 font-bold">{r.signed}</td>
                      <td className="py-1.5 text-center text-emerald-600">{r.free}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* תקולים לפי מחסן */}
          <Card className="p-4">
            <h3 className="text-xs font-bold text-slate-600 mb-2">תקולים לפי מחסן</h3>
            {defectivePerWarehouse.every((r) => r.total === 0) ? (
              <p className="text-xs text-emerald-600">✓ אין תקולים — כל המחסנים תקינים</p>
            ) : (
              <table className="w-full text-sm text-right">
                <thead>
                  <tr className="text-[10px] text-slate-500 border-b border-slate-200">
                    <th className="text-right pb-1.5">מחסן</th>
                    <th className="pb-1.5 text-center">בלאי</th>
                    <th className="pb-1.5 text-center">אבוד</th>
                    <th className="pb-1.5 text-center">סה״כ</th>
                  </tr>
                </thead>
                <tbody>
                  {defectivePerWarehouse.filter((r) => r.total > 0).map((r) => (
                    <tr key={r.id} className="border-t border-slate-100 text-xs">
                      <td className="py-1.5 font-medium">
                        {r.type ? WAREHOUSE_TYPE_ICON[r.type] + " " : ""}{r.name}
                      </td>
                      <td className="py-1.5 text-center">{r.serialWear + r.qtyWear > 0 ? <span className="text-amber-600 font-bold">{r.serialWear + r.qtyWear}</span> : "—"}</td>
                      <td className="py-1.5 text-center">{r.serialLoss > 0 ? <span className="text-rose-600 font-bold">{r.serialLoss}</span> : "—"}</td>
                      <td className="py-1.5 text-center font-bold">{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>

      {/* ============ 5. לוז ומשימות ============ */}
      <div className="mb-6">
        <h2 className="text-sm font-bold text-slate-500 mb-2">📅 לוז ומשימות</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {/* שבצ"ק היום */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-600">🚗 שבצ&quot;ק היום</h3>
              <Link href="/dispatch" className="text-[10px] text-blue-600 hover:underline">למסך שבצ&quot;ק ←</Link>
            </div>
            {todayDispatches.length === 0 ? (
              <p className="text-xs text-slate-400">אין שיבוצי רכבים להיום</p>
            ) : (
              <div className="space-y-1.5">
                {todayDispatches.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5 text-xs">
                    <span className="font-bold text-slate-700">{d.vehicleSerialUnit?.itemType?.name ?? "רכב"}</span>
                    <span className="text-slate-400 font-mono">{d.vehicleSerialUnit?.serialNumber}</span>
                    <span className="text-slate-500">{d.departureTime}</span>
                    {d.soldiers.length > 0 && <span className="text-slate-400">· {d.soldiers.length} חיילים</span>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* אירועי לוז פעילים */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-600">📋 אירועי לוז פעילים</h3>
              <Link href="/vacation/schedule?type=MY" className="text-[10px] text-blue-600 hover:underline">ללוז מלא ←</Link>
            </div>
            {activeScheduleEvents.length === 0 ? (
              <p className="text-xs text-slate-400">אין אירועי לוז פעילים</p>
            ) : (
              <div className="space-y-1.5">
                {activeScheduleEvents.map((e) => (
                  <Link key={e.id} href={`/vacation/schedule/${e.id}`} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5 text-xs hover:bg-blue-50 transition">
                    <span className={`rounded px-1.5 py-0.5 font-bold text-[10px] ${e.type === "PLUGATI" ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700"}`}>
                      {e.type === "PLUGATI" ? "מפורט" : "מקדים"}
                    </span>
                    <span className="font-bold text-slate-700">{e.name}</span>
                    <span className="text-slate-400">{fmt(e.startDate)}—{fmt(e.endDate)}</span>
                    <span className="text-slate-400 mr-auto">{e._count.forces} כוחות</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ============ 6. פעולות אחרונות ============ */}
      <div className="mb-6">
        <h2 className="text-sm font-bold text-slate-500 mb-2">🕐 פעולות אחרונות</h2>
        <Card className="p-4">
          {recentTransfers.length === 0 ? (
            <p className="text-xs text-slate-400">אין פעולות אחרונות</p>
          ) : (
            <div className="space-y-2">
              {recentTransfers.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2 last:border-0">
                  <div>
                    <span className="font-medium">{TRANSFER_TYPE[t.type]}</span>
                    <span className="text-xs text-slate-400 mr-2">
                      {t.fromHolder?.name ?? "חטיבה"} ← {t.toSoldier?.fullName ?? t.toHolder?.name ?? "חטיבה"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">{t.createdAt.toLocaleDateString("he-IL")}</span>
                    <Badge className={t.status === "PENDING" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>
                      {t.status === "PENDING" ? "ממתין" : "הושלם"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* === תפוגה — פירוט === */}
      {expiringSoon.length > 0 && (expiryBuckets.expired > 0 || expiryBuckets.soon7 > 0) && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-slate-500 mb-2">⏳ פריטים בתפוגה קרובה</h2>
          <Card className="p-4">
            <div className="space-y-1">
              {expiringSoon.filter((u) => {
                if (!u.expiryDate) return false;
                const d = Math.round((u.expiryDate.getTime() - now) / 86_400_000);
                return d <= 7;
              }).map((u) => {
                const days = Math.round((u.expiryDate!.getTime() - now) / 86_400_000);
                return (
                  <div key={u.id} className={`flex items-center justify-between text-xs rounded-lg px-3 py-1.5 border ${days < 0 ? "bg-rose-50 border-rose-200" : "bg-amber-50 border-amber-200"}`}>
                    <span className="flex items-center gap-2">
                      <span className="font-bold">{u.itemType.name}</span>
                      <span className="font-mono text-slate-500">{u.serialNumber}</span>
                      {u.currentHolder && <span className="text-slate-400">· {u.currentHolder.name}</span>}
                    </span>
                    <span className={`font-bold ${days < 0 ? "text-rose-700" : "text-amber-700"}`}>
                      {days < 0 ? `פג לפני ${-days} ימים` : days === 0 ? "היום!" : `בעוד ${days} ימים`}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
