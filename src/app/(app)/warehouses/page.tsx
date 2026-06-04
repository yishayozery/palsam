import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import { WAREHOUSE_TYPE_LABELS, WAREHOUSE_TYPE_ICON } from "@/lib/rbac";
import type { WarehouseType } from "@/generated/prisma";

export const dynamic = "force-dynamic";

export default async function WarehousesPage() {
  const user = await requireUser();
  if (user.role === "SUPER_ADMIN") redirect("/admin/battalions");
  const bId = user.battalionId!;

  const isWarehouseMgr = user.role === "WAREHOUSE_MANAGER";
  const isCompanyUser = user.role === "COMPANY_REP" || (user.role === "VIEWER" && user.holderIds.length > 0);
  const isBattalionWide = user.role === "BATTALION_ADMIN" || (user.role === "VIEWER" && user.holderIds.length === 0);

  // אילו מחזיקים המשתמש רואה: קצין מחסן→מחסניו; משתמש פלוגה→הפלוגה שלו; מפמ/צופה-גדודי→הכל
  const warehouses = (isWarehouseMgr || isBattalionWide)
    ? await prisma.holder.findMany({
        where: { battalionId: bId, kind: "WAREHOUSE", ...(isWarehouseMgr ? { id: { in: user.holderIds } } : {}) },
        orderBy: { warehouseType: "asc" },
      })
    : [];
  const companies = (isCompanyUser || isBattalionWide)
    ? await prisma.holder.findMany({
        where: { battalionId: bId, kind: "COMPANY", active: true, ...(isCompanyUser ? { id: { in: user.holderIds } } : {}) },
        orderBy: { name: "asc" },
      })
    : [];

  // יעד יחיד — ישר אליו
  if (warehouses.length === 1 && companies.length === 0 && warehouses[0].warehouseType) {
    redirect(`/warehouses/${warehouses[0].warehouseType}`);
  }
  if (companies.length === 1 && warehouses.length === 0) {
    redirect(`/company/${companies[0].id}`);
  }

  const whStats = await Promise.all(
    warehouses.map(async (w) => {
      const [serial, qty, pending] = await Promise.all([
        prisma.serialUnit.count({ where: { currentHolderId: w.id } }),
        prisma.stockBalance.aggregate({ _sum: { quantity: true }, where: { holderId: w.id } }),
        prisma.transfer.count({ where: { fromHolderId: w.id, status: "PENDING" } }),
      ]);
      return { w, serial, qty: qty._sum.quantity ?? 0, pending };
    }),
  );
  const coStats = await Promise.all(
    companies.map(async (c) => {
      const [serial, qty, soldiers] = await Promise.all([
        prisma.serialUnit.count({ where: { currentHolderId: c.id } }),
        prisma.stockBalance.aggregate({ _sum: { quantity: true }, where: { holderId: c.id } }),
        prisma.soldier.count({ where: { companyId: c.id, active: true } }),
      ]);
      return { c, serial, qty: qty._sum.quantity ?? 0, soldiers };
    }),
  );

  return (
    <div>
      <PageHeader title="מחסנים" subtitle="בחר מחסן לניהול מלאי, החתמות ודוחות — לפי ההרשאות שלך" />

      {whStats.length > 0 && (
        <>
          <h2 className="font-bold text-slate-700 mb-2">מחסני הגדוד</h2>
          <div className="grid sm:grid-cols-2 gap-5 mb-6">
            {whStats.map(({ w, serial, qty, pending }) => (
              <Link key={w.id} href={`/warehouses/${w.warehouseType}`}>
                <Card className="p-6 hover:shadow-md transition cursor-pointer">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-3xl">{WAREHOUSE_TYPE_ICON[w.warehouseType as WarehouseType]}</span>
                    <div>
                      <div className="font-bold text-lg text-slate-800">{w.name}</div>
                      <div className="text-xs text-slate-500">{WAREHOUSE_TYPE_LABELS[w.warehouseType as WarehouseType]}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><div className="text-2xl font-bold text-slate-800">{serial}</div><div className="text-xs text-slate-500">פרטני</div></div>
                    <div><div className="text-2xl font-bold text-slate-800">{qty}</div><div className="text-xs text-slate-500">כמותי</div></div>
                    <div><div className={`text-2xl font-bold ${pending > 0 ? "text-amber-600" : "text-slate-800"}`}>{pending}</div><div className="text-xs text-slate-500">במעבר</div></div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}

      {coStats.length > 0 && (
        <>
          <h2 className="font-bold text-slate-700 mb-2">מחסני פלוגות</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {coStats.map(({ c, serial, qty, soldiers }) => (
              <Link key={c.id} href={`/company/${c.id}`}>
                <Card className="p-6 hover:shadow-md transition cursor-pointer">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-3xl">🪖</span>
                    <div className="font-bold text-lg text-slate-800">{c.name}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><div className="text-2xl font-bold text-slate-800">{serial}</div><div className="text-xs text-slate-500">פרטני</div></div>
                    <div><div className="text-2xl font-bold text-slate-800">{qty}</div><div className="text-xs text-slate-500">כמותי</div></div>
                    <div><div className="text-2xl font-bold text-slate-800">{soldiers}</div><div className="text-xs text-slate-500">חיילים</div></div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
