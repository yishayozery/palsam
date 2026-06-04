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

  // קצין מחסן רואה רק את המחסנים המשויכים לו; מפמ/צופה — הכל
  const onlyMine = user.role === "WAREHOUSE_MANAGER" && user.holderIds.length > 0;
  const warehouses = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "WAREHOUSE", ...(onlyMine ? { id: { in: user.holderIds } } : {}) },
    orderBy: { warehouseType: "asc" },
  });

  // אם יש מחסן יחיד — ישר אליו
  if (onlyMine && warehouses.length === 1 && warehouses[0].warehouseType) {
    redirect(`/warehouses/${warehouses[0].warehouseType}`);
  }

  const stats = await Promise.all(
    warehouses.map(async (w) => {
      const [serial, qty, pending] = await Promise.all([
        prisma.serialUnit.count({ where: { currentHolderId: w.id } }),
        prisma.stockBalance.aggregate({ _sum: { quantity: true }, where: { holderId: w.id } }),
        prisma.transfer.count({ where: { fromHolderId: w.id, status: "PENDING" } }),
      ]);
      return { w, serial, qty: qty._sum.quantity ?? 0, pending };
    }),
  );

  return (
    <div>
      <PageHeader title="מחסני הגדוד" subtitle="בחר מחסן לניהול מלאי, החתמות ודוחות" />
      <div className="grid sm:grid-cols-2 gap-5">
        {stats.map(({ w, serial, qty, pending }) => (
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
    </div>
  );
}
