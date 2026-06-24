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

  const vehicleCategory = await prisma.category.findFirst({
    where: { battalionId: bId, warehouseType: "VEHICLES" },
    select: { id: true },
  });

  const [vehicleTypes, vehicles, soldiers, templates, vehicleTypeLicenses, companies, dispatchRoles, companyRoles] = await Promise.all([
    vehicleCategory
      ? prisma.itemType.findMany({
          where: { battalionId: bId, categoryId: vehicleCategory.id, active: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
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
        companyRoleId: true,
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
        vehicleItemType: { select: { id: true, name: true } },
        vehicleSerialUnit: { include: { itemType: { select: { id: true, name: true } } } },
        slots: {
          include: {
            dispatchRole: { select: { id: true, name: true, icon: true, isDriver: true } },
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
          orderBy: { seatIndex: "asc" },
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
    prisma.dispatchRole.findMany({
      where: { battalionId: bId, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.companyRole.findMany({
      where: { battalionId: bId, active: true },
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
        subtitle={`${templates.length} תבניות · ${vehicleTypes.length} סוגי רכב`}
        action={<Link href="/dispatch" className="text-sm text-blue-600 hover:underline">← חזרה לשבצ&quot;ק</Link>}
      />
      <TemplatesClient
        vehicleTypes={vehicleTypes}
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
          companyRoleId: s.companyRoleId,
          companyName: s.company?.name ?? null,
          roleName: s.companyRole?.name ?? null,
          licenseIds: s.drivingLicenses.map((dl) => dl.licenseType.id),
          licenseNames: s.drivingLicenses.map((dl) => dl.licenseType.name),
          drivingRefresherDate: s.drivingRefresherDate ? s.drivingRefresherDate.toISOString().slice(0, 10) : null,
        }))}
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        drivingRefreshDays={drivingRefreshDays}
        companyRoles={companyRoles}
        dispatchRoles={dispatchRoles.map((r) => ({
          id: r.id,
          name: r.name,
          icon: r.icon,
          isDriver: r.isDriver,
          companyRoleId: r.companyRoleId,
          sortOrder: r.sortOrder,
        }))}
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          vehicleItemTypeId: t.vehicleItemTypeId ?? "",
          vehicleItemTypeName: t.vehicleItemType?.name ?? "",
          vehicleSerialUnitId: t.vehicleSerialUnitId ?? "",
          vehicleSerial: t.vehicleSerialUnit?.serialNumber ?? "",
          slots: t.slots.map((s) => ({
            dispatchRoleId: s.dispatchRoleId,
            roleName: s.dispatchRole.name,
            roleIcon: s.dispatchRole.icon,
            isDriver: s.dispatchRole.isDriver,
            soldierId: s.soldier?.id ?? null,
            soldierName: s.soldier?.fullName ?? null,
            soldierCompany: s.soldier?.company?.name ?? null,
            seatIndex: s.seatIndex,
          })),
        }))}
      />
    </div>
  );
}
