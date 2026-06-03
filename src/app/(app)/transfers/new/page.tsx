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
  searchParams: Promise<{ type?: string }>;
}) {
  const user = await requireUser();
  const { type } = await searchParams;
  const isReturn = type === "RETURN";

  if (isReturn && !(can(user.role, "company.manage") || can(user.role, "armory.manage"))) {
    redirect("/transfers");
  }
  if (!isReturn && !can(user.role, "warehouse.manage")) {
    redirect("/transfers");
  }

  const warehouse = await prisma.holder.findFirst({ where: { type: "WAREHOUSE" } });
  const sourceId = isReturn ? user.holderId! : warehouse!.id;

  const [balances, serialUnits, targets, statuses] = await Promise.all([
    prisma.stockBalance.findMany({
      where: { holderId: sourceId, quantity: { gt: 0 } },
      include: { itemType: true, status: true },
    }),
    prisma.serialUnit.findMany({
      where: { currentHolderId: sourceId },
      include: { itemType: true, status: true },
      orderBy: { itemType: { name: "asc" } },
    }),
    prisma.holder.findMany({
      where: isReturn ? { type: "WAREHOUSE" } : { type: { in: ["COMPANY", "ARMORY"] }, active: true },
    }),
    prisma.itemStatus.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title={isReturn ? "החזרה למחסן הגדודי" : "הקצאת ציוד לפלוגה / נשקייה"}
        subtitle={isReturn
          ? "דיווח סטטוס הציוד המוחזר — ייכנס לאישור קצין הלוגיסטיקה"
          : "הציוד יוגדר 'מלאי במעבר' עד אישור הקבלה ביעד"}
      />
      <TransferForm
        isReturn={isReturn}
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
