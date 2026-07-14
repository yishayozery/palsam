import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import LocationEquipmentClient from "./LocationEquipmentClient";

export const dynamic = "force-dynamic";

export default async function EquipmentByLocationPage() {
  const user = await requireUser();
  if (!can(user, "signatures.manage") && !can(user, "reports.view") && !can(user, "stock") && !user.isAdmin) redirect("/dashboard");
  const bId = user.battalionId!;

  const units = await prisma.serialUnit.findMany({
    where: { battalionId: bId, dischargedAt: null },
    select: {
      id: true, serialNumber: true, lotQuantity: true,
      itemType: { select: { name: true } },
      status: { select: { name: true } },
      currentHolder: { select: { name: true } },
      signedSoldier: { select: { fullName: true, company: { select: { name: true } } } },
      equipmentLocation: { select: { name: true } },
      location: { select: { column: true, row: true, label: true } },
      physicalLocation: true,
      externalHolderName: true,
      vehicle: { select: { serialNumber: true, itemType: { select: { name: true } } } },
    },
    orderBy: [{ itemType: { name: "asc" } }],
    take: 8000,
  });

  const rows = units.map((u) => {
    const location =
      u.equipmentLocation?.name ||
      (u.vehicle ? `🚗 ${u.vehicle.itemType.name} ${u.vehicle.serialNumber}` : null) ||
      (u.location ? (u.location.label || `${u.location.column}${u.location.row}`) : null) ||
      u.physicalLocation ||
      (u.externalHolderName ? `חוץ: ${u.externalHolderName}` : null) ||
      (u.signedSoldier ? "אצל חייל" : "מחסן");
    return {
      id: u.id,
      location,
      holder: u.currentHolder?.name ?? (u.externalHolderName ? `חוץ: ${u.externalHolderName}` : "—"),
      item: u.itemType.name,
      serial: u.serialNumber,
      qty: u.lotQuantity ?? 1,
      status: u.status.name,
      company: u.signedSoldier?.company?.name ?? "",
      soldier: u.signedSoldier?.fullName ?? "",
    };
  });

  return <LocationEquipmentClient rows={rows} />;
}
