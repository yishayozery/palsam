import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import Link from "next/link";
import TemplatesClient from "./TemplatesClient";

export const dynamic = "force-dynamic";

export default async function DispatchTemplatesPage() {
  const user = await requireCapability("dispatch.manage");
  const bId = user.battalionId!;

  const battalion = await prisma.battalion.findUnique({
    where: { id: bId },
    select: { drivingRefreshDays: true },
  });
  const drivingRefreshDays = battalion?.drivingRefreshDays ?? 180;

  const [vehicles, soldiers, templates, vehicleTypeLicenses, companies] = await Promise.all([
    prisma.serialUnit.findMany({
      where: {
        battalionId: bId,
        dischargedAt: null,
        itemType: { category: { warehouseType: "VEHICLES" } },
      },
      include: {
        itemType: { select: { id: true, name: true } },
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
        drivingRefresherDate: true,
        company: { select: { name: true } },
        companyRole: { select: { name: true } },
        drivingLicenses: { include: { licenseType: { select: { id: true, name: true } } } },
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.dispatchTemplate.findMany({
      where: { battalionId: bId, active: true },
      include: {
        vehicleSerialUnit: { include: { itemType: { select: { id: true, name: true } } } },
        soldiers: {
          include: {
            soldier: {
              select: {
                id: true,
                fullName: true,
                personalNumber: true,
                company: { select: { name: true } },
                companyRole: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.vehicleTypeLicense.findMany({
      where: { itemType: { battalionId: bId } },
      select: { itemTypeId: true, licenseTypeId: true },
    }),
    prisma.holder.findMany({
      where: { battalionId: bId, kind: "COMPANY", active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const vtlMap: Record<string, string[]> = {};
  for (const vtl of vehicleTypeLicenses) {
    if (!vtlMap[vtl.itemTypeId]) vtlMap[vtl.itemTypeId] = [];
    vtlMap[vtl.itemTypeId].push(vtl.licenseTypeId);
  }

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
          itemTypeId: v.itemType.id,
          itemName: v.itemType.name,
          serialNumber: v.serialNumber,
          holderName: v.currentHolder?.name ?? null,
          requiredLicenseIds: vtlMap[v.itemType.id] || [],
        }))}
        soldiers={soldiers.map((s) => ({
          id: s.id,
          fullName: s.fullName,
          personalNumber: s.personalNumber,
          companyId: s.companyId,
          companyName: s.company?.name ?? null,
          roleName: s.companyRole?.name ?? null,
          licenseIds: s.drivingLicenses.map((dl) => dl.licenseType.id),
          licenseNames: s.drivingLicenses.map((dl) => dl.licenseType.name),
          drivingRefresherDate: s.drivingRefresherDate ? s.drivingRefresherDate.toISOString().slice(0, 10) : null,
        }))}
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        drivingRefreshDays={drivingRefreshDays}
        templates={templates.filter((t) => t.vehicleSerialUnit).map((t) => ({
          id: t.id,
          name: t.name,
          vehicleSerialUnitId: t.vehicleSerialUnitId,
          vehicleItemTypeId: t.vehicleSerialUnit.itemType.id,
          vehicleName: t.vehicleSerialUnit.itemType.name,
          vehicleSerial: t.vehicleSerialUnit.serialNumber,
          soldiers: t.soldiers.filter((ts) => ts.soldier).map((ts) => ({
            id: ts.soldier.id,
            fullName: ts.soldier.fullName,
            personalNumber: ts.soldier.personalNumber,
            companyName: ts.soldier.company?.name ?? null,
            roleName: ts.soldier.companyRole?.name ?? null,
            role: ts.role,
            seatIndex: ts.seatIndex,
          })),
        }))}
      />
    </div>
  );
}
