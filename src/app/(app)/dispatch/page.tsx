import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import DispatchClient from "./DispatchClient";

export const dynamic = "force-dynamic";

export default async function DispatchPage() {
  const user = await requireCapability("dispatch.manage");
  const bId = user.battalionId!;

  const [battalion, vehicles, soldiers, assignments] = await Promise.all([
    prisma.battalion.findUnique({ where: { id: bId }, select: { name: true } }),
    // כל רכבי הגדוד התקינים
    prisma.serialUnit.findMany({
      where: {
        battalionId: bId,
        itemType: { category: { warehouseType: "VEHICLES" } },
      },
      include: {
        itemType: { select: { name: true, sku: true } },
        status: { select: { name: true, isWear: true, isLoss: true } },
        currentHolder: { select: { id: true, name: true, kind: true } },
      },
      orderBy: [{ itemType: { name: "asc" } }, { serialNumber: "asc" }],
    }),
    // כל חיילי הגדוד הפעילים
    prisma.soldier.findMany({
      where: { battalionId: bId, active: true },
      select: { id: true, fullName: true, personalNumber: true, phone: true, companyId: true, company: { select: { name: true } } },
      orderBy: { fullName: "asc" },
    }),
    // כל השיבוצים - גלוי לכולם
    prisma.vehicleAssignment.findMany({
      where: { battalionId: bId },
      include: {
        vehicleSerialUnit: {
          include: {
            itemType: { select: { name: true } },
            currentHolder: { select: { id: true, name: true, kind: true } },
          },
        },
        company: { select: { name: true } },
        createdBy: { select: { fullName: true } },
        soldiers: { include: { soldier: { select: { id: true, fullName: true, personalNumber: true, company: { select: { name: true } } } } } },
      },
      orderBy: [{ missionDate: "desc" }, { departureTime: "desc" }],
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="🚗 שבצ&quot;ק - שיבוץ רכבים"
        subtitle="שיבוץ חיילים לרכב למשימה. ניתן לצפייה ועריכה ע&quot;י כל המשתמשים."
      />

      {assignments.length === 0 && vehicles.length === 0 ? (
        <Card className="p-6">
          <EmptyState>
            <div className="space-y-2 text-center">
              <p>🚫 אין רכבים פעילים בגדוד.</p>
              <p className="text-sm">כדי ליצור שיבוץ, יש לקלוט רכבים תחת קטגוריה ש-warehouseType=VEHICLES.</p>
            </div>
          </EmptyState>
        </Card>
      ) : (
        <DispatchClient
          battalionName={battalion?.name ?? ""}
          myCompanyId={user.holderId ?? null}
          vehicles={vehicles.map((v) => ({
            id: v.id,
            itemName: v.itemType.name,
            serialNumber: v.serialNumber,
            statusName: v.status.name,
            isWear: v.status.isWear,
            isLoss: v.status.isLoss,
            holderId: v.currentHolderId,
            holderName: v.currentHolder?.name ?? null,
            holderKind: v.currentHolder?.kind ?? null,
          }))}
          soldiers={soldiers.map((s) => ({
            id: s.id, fullName: s.fullName, personalNumber: s.personalNumber, phone: s.phone,
            companyId: s.companyId, companyName: s.company?.name ?? null,
          }))}
          assignments={assignments.map((a) => ({
            id: a.id,
            vehicleSerialUnitId: a.vehicleSerialUnitId,
            vehicleName: a.vehicleSerialUnit.itemType.name,
            vehicleSerial: a.vehicleSerialUnit.serialNumber,
            vehicleCompanyName: a.vehicleSerialUnit.currentHolder?.kind === "COMPANY"
              ? a.vehicleSerialUnit.currentHolder.name : null,
            companyName: a.company?.name ?? null,
            missionDate: a.missionDate.toISOString().slice(0, 10),
            departureTime: a.departureTime,
            createdByName: a.createdBy.fullName,
            createdAt: a.createdAt.toISOString(),
            completedAt: a.completedAt?.toISOString() ?? null,
            soldiers: a.soldiers.map((s) => ({
              id: s.soldier.id,
              fullName: s.soldier.fullName,
              personalNumber: s.soldier.personalNumber,
              companyName: s.soldier.company?.name ?? null,
            })),
          }))}
        />
      )}
    </div>
  );
}
