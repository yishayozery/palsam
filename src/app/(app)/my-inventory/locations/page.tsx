import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import CompanyLocationsClient from "./CompanyLocationsClient";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CompanyLocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; loc?: string; signed?: string }>;
}) {
  const user = await requireCapability("company.manage");
  const bId = user.battalionId!;
  const companyId = user.holderId;
  if (!companyId) {
    return (
      <div>
        <PageHeader title="📍 מיקומי ציוד" />
        <Card className="p-6"><p className="text-sm text-slate-400">לא משויך לפלוגה — פנה למפ״ם.</p></Card>
      </div>
    );
  }
  const sp = await searchParams;
  const { q = "", loc = "", signed = "" } = sp;

  const company = await prisma.holder.findUnique({ where: { id: companyId }, select: { name: true } });

  // 🆕 כל הסריאליים של הפלוגה: גם אלה שמיקומם currentHolderId=company,
  //    וגם אלה שחתומים על חיילי הפלוגה (currentHolderId יכול להיות במחסן)
  const serialUnits = await prisma.serialUnit.findMany({
    where: {
      battalionId: bId,
      OR: [
        { currentHolderId: companyId },
        { signedSoldier: { companyId } },
      ],
    },
    include: {
      itemType: { select: { name: true, sku: true, trackingMethod: true, category: { select: { warehouseType: true } } } },
      status: { select: { name: true, isWear: true, isLoss: true } },
      signedSoldier: { select: { id: true, fullName: true, personalNumber: true } },
      equipmentLocation: { select: { id: true, name: true, vehicleSerialUnit: { select: { serialNumber: true } } } },
      currentHolder: { select: { name: true, kind: true } },
    },
    orderBy: [{ itemType: { name: "asc" } }, { serialNumber: "asc" }],
  });

  // מיקומי הציוד של הפלוגה — לבחירה
  const equipmentLocations = await prisma.equipmentLocation.findMany({
    where: { holderId: companyId, active: true },
    orderBy: { name: "asc" },
    include: { vehicleSerialUnit: { select: { serialNumber: true } } },
  });

  // רכבים בפלוגה — להצעה אם עדיין לא הוגדרו כמיקום
  const vehicles = await prisma.serialUnit.findMany({
    where: {
      currentHolderId: companyId,
      itemType: { category: { warehouseType: "VEHICLES" } },
    },
    select: { id: true, serialNumber: true, itemType: { select: { name: true } } },
    orderBy: { serialNumber: "asc" },
  });

  // סטטיסטיקות לפי מיקום
  const byLocation = new Map<string, number>();
  let unassigned = 0;
  for (const u of serialUnits) {
    if (u.equipmentLocationId) {
      byLocation.set(u.equipmentLocationId, (byLocation.get(u.equipmentLocationId) ?? 0) + 1);
    } else {
      unassigned++;
    }
  }

  return (
    <div>
      <PageHeader
        title="📍 מיקומי ציוד הפלוגה"
        subtitle={`${company?.name ?? ""} — איפה כל פריט סריאלי/אצווה נמצא פיזית. מעבר מהיר בין רכבים, אוהלים וערמות.`}
        action={
          <Link href="/locations?tab=equipment"
            className="bg-white border border-slate-300 text-slate-700 rounded-lg px-3 py-2 text-xs hover:bg-slate-50">
            ⚙️ הגדר מיקומים
          </Link>
        }
      />

      {equipmentLocations.length === 0 ? (
        <Card className="p-6 mb-4 bg-amber-50 border-amber-300">
          <EmptyState>
            <div className="space-y-2">
              <p>🚫 עוד לא הוגדרו מיקומי ציוד לפלוגה.</p>
              <p className="text-sm">כדי לעקוב פיזית אחרי הפריטים שלך, הגדר קודם מיקומים (אוהלים, רכבים, ערמות).</p>
              <Link href="/locations?tab=equipment"
                className="inline-block bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm">
                ⚙️ הגדר מיקומים עכשיו
              </Link>
              {vehicles.length > 0 && (
                <p className="text-xs text-slate-600 mt-2">💡 לפלוגה שלך {vehicles.length} רכבים שיתווספו אוטומטית כמיקומים אפשריים.</p>
              )}
            </div>
          </EmptyState>
        </Card>
      ) : null}

      <CompanyLocationsClient
        items={serialUnits.map((u) => ({
          id: u.id,
          itemName: u.itemType.name,
          sku: u.itemType.sku,
          serial: u.serialNumber,
          lotQuantity: u.lotQuantity,
          isLot: u.itemType.trackingMethod === "LOT" || (u.lotQuantity ?? 1) > 1,
          warehouseType: u.itemType.category?.warehouseType ?? null,
          statusName: u.status.name,
          isWear: u.status.isWear,
          isLoss: u.status.isLoss,
          signedSoldier: u.signedSoldier
            ? { id: u.signedSoldier.id, name: u.signedSoldier.fullName, personalNumber: u.signedSoldier.personalNumber }
            : null,
          currentHolderName: u.currentHolder?.name ?? null,
          currentHolderKind: u.currentHolder?.kind ?? null,
          equipmentLocationId: u.equipmentLocationId,
          equipmentLocationName: u.equipmentLocation?.name ?? null,
        }))}
        locations={equipmentLocations.map((l) => ({
          id: l.id,
          name: l.name,
          vehicleSerial: l.vehicleSerialUnit?.serialNumber ?? null,
          isVehicle: !!l.vehicleSerialUnitId,
          count: byLocation.get(l.id) ?? 0,
        }))}
        unassignedCount={unassigned}
        initialQ={q}
        initialLoc={loc}
        initialSigned={signed}
      />
    </div>
  );
}
