import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import CompanyLocationsClient from "./CompanyLocationsClient";
import ManageLocationsModal from "./ManageLocationsModal";

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

  // 🆕 ציוד כמותי שיש לפלוגה (לא חתום על חיילים)
  const companyQtyStock = await prisma.stockBalance.findMany({
    where: { battalionId: bId, holderId: companyId, quantity: { gt: 0 },
      itemType: { trackingMethod: "QUANTITY" } },
    include: {
      itemType: { select: { name: true, sku: true, unit: true } },
      status: { select: { name: true, isWear: true, isLoss: true } },
      equipmentLocation: { select: { id: true, name: true } },
    },
  });

  // 🆕 ציוד כמותי חתום על חיילים (חישוב מ-SIGNOUT-CHECKIN) + המיקום שלו (SoldierItemLocation)
  const companySoldiers = await prisma.soldier.findMany({
    where: { battalionId: bId, companyId, active: true },
    select: { id: true, fullName: true, personalNumber: true },
  });
  const soldierIds = companySoldiers.map((s) => s.id);
  const signedQtyLines = soldierIds.length === 0 ? [] : await prisma.transferLine.findMany({
    where: {
      transfer: { battalionId: bId, status: "COMPLETED", type: { in: ["SIGNOUT", "CHECKIN"] },
        toSoldierId: { in: soldierIds } },
      serialUnitId: null,
    },
    include: {
      itemType: { select: { name: true, sku: true, unit: true, trackingMethod: true } },
      status: { select: { name: true, isWear: true, isLoss: true } },
      transfer: { select: { type: true, toSoldierId: true } },
    },
  });
  // קיבוץ
  type SignedQtyAcc = {
    soldierId: string; itemTypeId: string; statusId: string;
    itemName: string; sku: string | null; unit: string;
    statusName: string; isWear: boolean; isLoss: boolean;
    quantity: number;
  };
  const signedQtyMap = new Map<string, SignedQtyAcc>();
  for (const l of signedQtyLines) {
    const sId = l.transfer.toSoldierId;
    if (!sId || !l.statusId) continue;
    if (l.itemType.trackingMethod !== "QUANTITY") continue;
    const k = `${sId}|${l.itemTypeId}|${l.statusId}`;
    const sign = l.transfer.type === "SIGNOUT" ? 1 : -1;
    const cur = signedQtyMap.get(k);
    if (cur) cur.quantity += sign * l.quantity;
    else signedQtyMap.set(k, {
      soldierId: sId, itemTypeId: l.itemTypeId, statusId: l.statusId,
      itemName: l.itemType.name, sku: l.itemType.sku, unit: l.itemType.unit,
      statusName: l.status!.name, isWear: l.status!.isWear, isLoss: l.status!.isLoss,
      quantity: sign * l.quantity,
    });
  }
  const signedQtyRows = Array.from(signedQtyMap.values()).filter((a) => a.quantity > 0);

  // SoldierItemLocation rows — לחיילים בפלוגה
  const soldierItemLocations = soldierIds.length === 0 ? [] : await prisma.soldierItemLocation.findMany({
    where: { battalionId: bId, soldierId: { in: soldierIds } },
    select: { soldierId: true, itemTypeId: true, statusId: true, equipmentLocationId: true, quantity: true },
  });

  // סטטיסטיקות לפי מיקום — סריאלי + כמותי + כמותי חתום
  const byLocation = new Map<string, number>();
  let unassigned = 0;
  for (const u of serialUnits) {
    if (u.equipmentLocationId) byLocation.set(u.equipmentLocationId, (byLocation.get(u.equipmentLocationId) ?? 0) + 1);
    else unassigned++;
  }
  for (const b of companyQtyStock) {
    if (b.equipmentLocationId) byLocation.set(b.equipmentLocationId, (byLocation.get(b.equipmentLocationId) ?? 0) + b.quantity);
    else unassigned += b.quantity;
  }
  for (const sil of soldierItemLocations) {
    byLocation.set(sil.equipmentLocationId, (byLocation.get(sil.equipmentLocationId) ?? 0) + sil.quantity);
  }
  // חישוב ציוד חתום-על-חייל שעדיין לא הוגדר לו מיקום
  for (const sr of signedQtyRows) {
    const totalAtLocations = soldierItemLocations
      .filter((sil) => sil.soldierId === sr.soldierId && sil.itemTypeId === sr.itemTypeId && sil.statusId === sr.statusId)
      .reduce((s, sil) => s + sil.quantity, 0);
    const missing = sr.quantity - totalAtLocations;
    if (missing > 0) unassigned += missing;
  }

  // 📊 דשבורד מיקומים - חישוב אחוז ציוד ממוקם
  const placedTotal = Array.from(byLocation.values()).reduce((s, n) => s + n, 0);
  const totalAllItems = placedTotal + unassigned;
  const placedPct = totalAllItems === 0 ? 100 : Math.round((placedTotal / totalAllItems) * 100);
  const dashboardLabel = placedPct === 100 ? "כל הציוד ממוקם 🎉" : placedPct >= 70 ? "ברוב הציוד יש מיקום" : "רוב הציוד עוד לא ממוקם";
  const dashboardStyle = placedPct === 100
    ? { card: "bg-emerald-50 border-emerald-300", text: "text-emerald-700", label: "text-emerald-900", track: "bg-emerald-200", bar: "bg-emerald-600" }
    : placedPct >= 70
      ? { card: "bg-amber-50 border-amber-300", text: "text-amber-700", label: "text-amber-900", track: "bg-amber-200", bar: "bg-amber-600" }
      : { card: "bg-rose-50 border-rose-300", text: "text-rose-700", label: "text-rose-900", track: "bg-rose-200", bar: "bg-rose-600" };

  return (
    <div>
      <PageHeader
        title="📍 מיקומי ציוד הפלוגה"
        subtitle={`${company?.name ?? ""} — לכל פריט (סריאלי או כמותי) מיקום פיזי: רכב, אוהל, ערמה.`}
        action={
          <div className="flex gap-2 flex-wrap">
            <a href="/my-inventory/locations/report" download
              className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg px-3 py-2 text-xs">
              📊 דוח מאוחד (Excel)
            </a>
            <ManageLocationsModal
              holderName={company?.name ?? ""}
              locations={equipmentLocations.map((l) => ({
                id: l.id, name: l.name,
                vehicleSerialUnitId: l.vehicleSerialUnitId,
                vehicleSerialNumber: l.vehicleSerialUnit?.serialNumber ?? null,
                unitsCount: byLocation.get(l.id) ?? 0,
              }))}
              vehicles={vehicles.map((v) => ({ id: v.id, serialNumber: v.serialNumber, itemName: v.itemType.name }))}
            />
          </div>
        }
      />

      {equipmentLocations.length === 0 ? (
        <Card className="p-6 mb-4 bg-amber-50 border-amber-300">
          <EmptyState>
            <div className="space-y-2">
              <p>🚫 עוד לא הוגדרו מיקומי ציוד לפלוגה.</p>
              <p className="text-sm">כדי לעקוב פיזית אחרי הפריטים שלך, הגדר קודם מיקומים (אוהלים, רכבים, ערמות) מהכפתור ⚙️ למעלה.</p>
              {vehicles.length > 0 && (
                <p className="text-xs text-slate-600 mt-2">💡 לפלוגה שלך {vehicles.length} רכבים שיתווספו אוטומטית כמיקומים אפשריים.</p>
              )}
            </div>
          </EmptyState>
        </Card>
      ) : (
        <Card className={`p-4 mb-4 ${dashboardStyle.card}`}>
          <div className="flex items-center gap-4 flex-wrap">
            <div className={`text-3xl font-bold ${dashboardStyle.text}`}>{placedPct}%</div>
            <div className="flex-1 min-w-44">
              <div className={`text-sm font-medium ${dashboardStyle.label}`}>{dashboardLabel}</div>
              <div className="text-xs text-slate-600 mt-0.5">
                <b>{placedTotal}</b> מתוך <b>{totalAllItems}</b> פריטים ממוקמים, {unassigned} ללא מיקום
              </div>
              <div className={`mt-2 h-2 ${dashboardStyle.track} rounded-full overflow-hidden`}>
                <div className={`h-full ${dashboardStyle.bar} rounded-full transition-all`} style={{ width: `${placedPct}%` }} />
              </div>
            </div>
          </div>
        </Card>
      )}

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
        companyQtyStock={companyQtyStock.map((b) => ({
          stockBalanceId: b.id,
          itemTypeId: b.itemTypeId,
          itemName: b.itemType.name,
          sku: b.itemType.sku,
          unit: b.itemType.unit,
          statusId: b.statusId,
          statusName: b.status.name,
          isWear: b.status.isWear,
          isLoss: b.status.isLoss,
          quantity: b.quantity,
          equipmentLocationId: b.equipmentLocationId,
          equipmentLocationName: b.equipmentLocation?.name ?? null,
        }))}
        signedQtyRows={signedQtyRows.map((r) => {
          const soldier = companySoldiers.find((s) => s.id === r.soldierId);
          const placements = soldierItemLocations.filter((sil) =>
            sil.soldierId === r.soldierId && sil.itemTypeId === r.itemTypeId && sil.statusId === r.statusId);
          return {
            soldierId: r.soldierId,
            soldierName: soldier?.fullName ?? "",
            soldierPN: soldier?.personalNumber ?? null,
            itemTypeId: r.itemTypeId,
            itemName: r.itemName,
            sku: r.sku,
            unit: r.unit,
            statusId: r.statusId,
            statusName: r.statusName,
            isWear: r.isWear,
            isLoss: r.isLoss,
            totalQuantity: r.quantity,
            placements: placements.map((p) => ({
              equipmentLocationId: p.equipmentLocationId,
              equipmentLocationName: equipmentLocations.find((l) => l.id === p.equipmentLocationId)?.name ?? "",
              quantity: p.quantity,
            })),
          };
        })}
        soldiers={companySoldiers.map((s) => ({ id: s.id, name: s.fullName, personalNumber: s.personalNumber }))}
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
