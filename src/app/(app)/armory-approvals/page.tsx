import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import ApprovalsClient from "./ApprovalsClient";

export const dynamic = "force-dynamic";

export default async function ArmoryApprovalsPage() {
  const user = await requireCapability("weapons.approve");
  const bId = user.battalionId!;

  const soldiers = await prisma.soldier.findMany({
    where: { battalionId: bId, active: true },
    include: { company: { select: { name: true } } },
    orderBy: [{ company: { name: "asc" } }, { fullName: "asc" }],
  });
  const armoryHolder = await prisma.holder.findFirst({
    where: { battalionId: bId, warehouseType: "ARMORY", active: true },
    select: { armoryTestUrl: true },
  });

  // משלימים שמות מאשרים
  const approverIds = soldiers.map((s) => s.weaponsApprovedById).filter((x): x is string => !!x);
  const approvers = approverIds.length > 0
    ? await prisma.appUser.findMany({ where: { id: { in: approverIds } }, select: { id: true, fullName: true } })
    : [];

  return (
    <div>
      <PageHeader
        title='🔫 אישור חיילים לנשק'
        subtitle='מג"ד / סמג"ד מאשרים חיילים לקבלת נשק. תנאי מוקדם: אישור שלישות.'
      />

      {soldiers.length === 0 ? (
        <Card className="p-6"><EmptyState>אין חיילים פעילים בגדוד</EmptyState></Card>
      ) : (
        <ApprovalsClient
          armoryTestUrl={armoryHolder?.armoryTestUrl ?? null}
          approverName={user.fullName}
          soldiers={soldiers.map((s) => ({
            id: s.id,
            fullName: s.fullName,
            personalNumber: s.personalNumber,
            phone: s.phone,
            companyName: s.company?.name ?? null,
            enlisted: s.enlisted,
            enlistedAt: s.enlistedAt?.toISOString() ?? null,
            armoryTestDone: !!s.armoryTestProofAt,
            weaponsApprovedAt: s.weaponsApprovedAt?.toISOString() ?? null,
            weaponsApprovedByName: s.weaponsApprovedById
              ? approvers.find((a) => a.id === s.weaponsApprovedById)?.fullName ?? null
              : null,
          }))}
        />
      )}
    </div>
  );
}
