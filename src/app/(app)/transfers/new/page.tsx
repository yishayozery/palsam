import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import TransferForm from "./TransferForm";

export const dynamic = "force-dynamic";

export default async function NewTransferPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; from?: string }>;
}) {
  const user = await requireUser();
  const bId = user.battalionId!;
  const { type, from } = await searchParams;
  const isReturn = type === "RETURN";

  if (isReturn && !can(user.role, "company.manage")) redirect("/transfers");
  if (!isReturn && !can(user.role, "warehouse.operate")) redirect("/transfers");

  // מקור: מבין מחסני המשתמש (לקצין עם כמה מחסנים — בורר)
  const myWarehouses = isReturn
    ? []
    : await prisma.holder.findMany({ where: { id: { in: user.holderIds }, kind: "WAREHOUSE" }, orderBy: { name: "asc" } });
  const sourceId =
    (from && user.holderIds.includes(from) ? from : null) ||
    (myWarehouses[0]?.id) ||
    user.holderId!;

  const [balances, serialUnits, targets, statuses] = await Promise.all([
    prisma.stockBalance.findMany({
      where: { battalionId: bId, holderId: sourceId, quantity: { gt: 0 } },
      include: { itemType: true, status: true },
    }),
    prisma.serialUnit.findMany({
      where: { battalionId: bId, currentHolderId: sourceId },
      include: { itemType: true, status: true },
      orderBy: { itemType: { name: "asc" } },
    }),
    prisma.holder.findMany({
      where: { battalionId: bId, active: true, kind: isReturn ? "WAREHOUSE" : "COMPANY" },
      orderBy: { name: "asc" },
    }),
    prisma.itemStatus.findMany({ where: { battalionId: bId, active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title={isReturn ? "החזרה למחסן הגדודי" : "הקצאת ציוד לפלוגה / נשקייה"}
        subtitle={isReturn
          ? "דיווח סטטוס הציוד המוחזר — ייכנס לאישור קצין הלוגיסטיקה"
          : "הציוד יוגדר 'מלאי במעבר' עד אישור הקבלה ביעד"}
      />
      {!isReturn && myWarehouses.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-sm text-slate-500 self-center">מחסן מקור:</span>
          {myWarehouses.map((w) => (
            <Link key={w.id} href={`/transfers/new?type=ISSUE&from=${w.id}`}
              className={`text-sm rounded-lg px-3 py-1.5 ${sourceId === w.id ? "bg-slate-800 text-white" : "bg-white border border-slate-300 text-slate-600"}`}>
              {w.name}
            </Link>
          ))}
        </div>
      )}
      <TransferForm
        isReturn={isReturn}
        fromHolderId={sourceId}
        balances={balances.map((b) => ({
          itemTypeId: b.itemTypeId, statusId: b.statusId,
          name: b.itemType.name, unit: b.itemType.unit, status: b.status.name, quantity: b.quantity,
        }))}
        serialUnits={serialUnits.map((s) => ({
          id: s.id, name: s.itemType.name, serialNumber: s.serialNumber, status: s.status.name,
          lotQuantity: s.lotQuantity,
        }))}
        targets={targets.map((t) => ({ id: t.id, name: t.name }))}
        statuses={statuses.map((s) => ({ id: s.id, name: s.name }))}
      />
    </div>
  );
}
