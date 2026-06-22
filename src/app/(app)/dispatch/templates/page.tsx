import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import Link from "next/link";
import TemplatesClient from "./TemplatesClient";

export const dynamic = "force-dynamic";

export default async function DispatchTemplatesPage() {
  const user = await requireCapability("dispatch.manage");
  const bId = user.battalionId!;

  const [vehicles, soldiers, templates, licenseTypes] = await Promise.all([
    prisma.serialUnit.findMany({
      where: {
        battalionId: bId,
        dischargedAt: null,
        itemType: { category: { warehouseType: "VEHICLES" } },
      },
      include: {
        itemType: { select: { name: true } },
        currentHolder: { select: { name: true } },
      },
      orderBy: [{ itemType: { name: "asc" } }, { serialNumber: "asc" }],
    }),
    prisma.soldier.findMany({
      where: { battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] } },
      select: {
        id: true,
        fullName: true,
        personalNumber: true,
        companyId: true,
        company: { select: { name: true } },
        drivingLicenses: { include: { licenseType: { select: { name: true } } } },
        signedSerialUnits: { select: { itemType: { select: { name: true } }, serialNumber: true }, take: 10 },
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.dispatchTemplate.findMany({
      where: { battalionId: bId, active: true },
      include: {
        vehicleSerialUnit: { include: { itemType: { select: { name: true } } } },
        soldiers: {
          include: {
            soldier: {
              select: { id: true, fullName: true, personalNumber: true, company: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.drivingLicenseType.findMany({
      where: { battalionId: bId, active: true },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title='שבצ"ק קבוע'
        subtitle={`${templates.length} תבניות · ${vehicles.length} רכבים`}
        action={<Link href="/dispatch" className="text-sm text-blue-600 hover:underline">← חזרה לשבצ&quot;ק</Link>}
      />
      <TemplatesClient
        vehicles={vehicles.map((v) => ({
          id: v.id,
          itemName: v.itemType.name,
          serialNumber: v.serialNumber,
          holderName: v.currentHolder?.name ?? null,
        }))}
        soldiers={soldiers.map((s) => ({
          id: s.id,
          fullName: s.fullName,
          personalNumber: s.personalNumber,
          companyName: s.company?.name ?? null,
          licenses: s.drivingLicenses.map((dl) => dl.licenseType.name),
          signedEquipment: s.signedSerialUnits.map((u) => `${u.itemType.name} (${u.serialNumber})`),
        }))}
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          vehicleSerialUnitId: t.vehicleSerialUnitId,
          vehicleName: t.vehicleSerialUnit.itemType.name,
          vehicleSerial: t.vehicleSerialUnit.serialNumber,
          soldiers: t.soldiers.map((ts) => ({
            id: ts.soldier.id,
            fullName: ts.soldier.fullName,
            personalNumber: ts.soldier.personalNumber,
            companyName: ts.soldier.company?.name ?? null,
          })),
        }))}
      />
    </div>
  );
}
