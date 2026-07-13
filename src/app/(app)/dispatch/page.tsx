import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import MissionsSection from "./MissionsSection";

export const dynamic = "force-dynamic";

export default async function DispatchPage() {
  const user = await requireCapability("dispatch.manage");
  const bId = user.battalionId!;

  // holderId = מחסן (WAREHOUSE_MANAGER) או פלוגה (COMPANY_REP)
  // לקשר"ג עם מחלקות — מוצאים את הפלוגה דרך המחלקות
  const companies = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "COMPANY", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const isCompanyHolder = user.holderId ? companies.some((c) => c.id === user.holderId) : false;
  let effectiveCompanyId: string | null = null;
  if (isCompanyHolder) {
    effectiveCompanyId = user.holderId;
  } else if (user.squadIds.length > 0) {
    const sq = await prisma.squad.findFirst({
      where: { id: { in: user.squadIds } },
      select: { companyId: true },
    });
    effectiveCompanyId = sq?.companyId ?? null;
  }

  const [battalion, vehicles, soldiers, templates, vehicleTypeLicenses, missions] = await Promise.all([
    prisma.battalion.findUnique({ where: { id: bId }, select: { name: true } }),
    // כל רכבי הגדוד התקינים
    prisma.serialUnit.findMany({
      where: {
        battalionId: bId,
        dischargedAt: null,
        itemType: { category: { warehouseType: "VEHICLES" } },
      },
      include: {
        itemType: { select: { name: true, sku: true } },
        status: { select: { name: true, isWear: true, isLoss: true } },
        currentHolder: { select: { id: true, name: true, kind: true } },
      },
      orderBy: [{ itemType: { name: "asc" } }, { serialNumber: "asc" }],
    }),
    // כל חיילי הגדוד הפעילים + הרשאות נהיגה
    prisma.soldier.findMany({
      where: { battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] } },
      select: {
        id: true, fullName: true, personalNumber: true, phone: true, companyId: true,
        drivingProcedureSignedAt: true, drivingRefresherDate: true,
        company: { select: { name: true } },
        companyRole: { select: { name: true } },
        drivingLicenses: { include: { licenseType: { select: { id: true, name: true } } } },
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.dispatchTemplate.findMany({
      where: { battalionId: bId, active: true },
      include: {
        vehicleSerialUnit: { include: { itemType: { select: { name: true } } } },
        vehicleItemType: { select: { name: true } },
        slots: { include: { soldier: { select: { id: true, fullName: true } }, dispatchRole: { select: { id: true, isDriver: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.vehicleTypeLicense.findMany({
      where: { itemType: { battalionId: bId } },
      select: { itemTypeId: true, licenseTypeId: true },
    }),
    prisma.mission.findMany({
      where: { battalionId: bId },
      include: {
        company: { select: { name: true } },
        createdBy: { select: { fullName: true } },
        commanderSoldier: { select: { fullName: true } },
        vehicles: {
          orderBy: [{ convoyOrder: "asc" }, { createdAt: "asc" }],
          include: {
            vehicleSerialUnit: { include: { itemType: { select: { id: true, name: true } } } },
            soldiers: { include: { soldier: { select: { id: true, fullName: true, personalNumber: true } } } },
          },
        },
      },
      orderBy: [{ missionDate: "desc" }, { departureTime: "desc" }],
    }),
  ]);

  const dispatchRoles = await prisma.dispatchRole.findMany({
    where: { battalionId: bId, active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, icon: true, isDriver: true },
  });

  // חיילים נוכחים היום — לוולידציית התראה (לא חסימה) בשיבוץ למשימה
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const presentRecords = await prisma.attendanceRecord.findMany({
    where: { date: new Date(todayStr + "T00:00:00Z"), soldier: { battalionId: bId }, status: { isPresent: true } },
    select: { soldierId: true },
  });
  const presentSoldierIds = presentRecords.map((r) => r.soldierId);

  const vtlMap: Record<string, string[]> = {};
  for (const vl of vehicleTypeLicenses) {
    (vtlMap[vl.itemTypeId] ??= []).push(vl.licenseTypeId);
  }

  // הסמכת נהג — רישיון לסוג הרכב + נוהל נהיגה בתוקף + ריענון בתוקף
  const driverIds = [...new Set(missions.flatMap((m) => m.vehicles.flatMap((v) => v.soldiers.filter((s) => s.isDriver && s.soldierId).map((s) => s.soldierId!))))];
  const [battDriving, driverQualData] = await Promise.all([
    prisma.battalion.findUnique({ where: { id: bId }, select: { drivingRefreshDays: true, drivingProcedureUpdatedAt: true } }),
    driverIds.length ? prisma.soldier.findMany({ where: { id: { in: driverIds } }, select: { id: true, drivingRefresherDate: true, drivingProcedureSignedAt: true, drivingLicenses: { select: { licenseTypeId: true } } } }) : [],
  ]);
  const qualById = new Map(driverQualData.map((s) => [s.id, s]));
  const refreshDays = battDriving?.drivingRefreshDays ?? 180;
  const procUpdated = battDriving?.drivingProcedureUpdatedAt ?? null;
  const driverQualified = (soldierId: string, itemTypeId: string | null): boolean => {
    const s = qualById.get(soldierId);
    if (!s) return false;
    const req = itemTypeId ? (vtlMap[itemTypeId] ?? []) : [];
    const has = new Set(s.drivingLicenses.map((l) => l.licenseTypeId));
    if (req.some((id) => !has.has(id))) return false;
    if (!s.drivingProcedureSignedAt) return false;
    if (procUpdated && s.drivingProcedureSignedAt < procUpdated) return false;
    if (!s.drivingRefresherDate) return false;
    const exp = new Date(s.drivingRefresherDate); exp.setDate(exp.getDate() + refreshDays);
    if (exp.getTime() < Date.now()) return false;
    return true;
  };

  // 🆕 ציוד המורכב על כל רכב במשימות (serialUnits.vehicleId = הרכב) — "מה יש על הרכב"
  const missionVehIds = [...new Set(missions.flatMap((m) => m.vehicles.map((v) => v.vehicleSerialUnitId).filter((x): x is string => !!x)))];
  const mountedEquip = missionVehIds.length ? await prisma.serialUnit.findMany({
    where: { vehicleId: { in: missionVehIds }, battalionId: bId },
    select: { vehicleId: true, serialNumber: true, itemType: { select: { name: true } }, signedSoldier: { select: { fullName: true } } },
    orderBy: { itemType: { name: "asc" } },
  }) : [];
  const equipByVehicle = new Map<string, { name: string; serial: string; holder: string | null }[]>();
  for (const e of mountedEquip) {
    if (!e.vehicleId) continue;
    const arr = equipByVehicle.get(e.vehicleId) ?? [];
    arr.push({ name: e.itemType.name, serial: e.serialNumber, holder: e.signedSoldier?.fullName ?? null });
    equipByVehicle.set(e.vehicleId, arr);
  }

  const missionsData = missions.map((m) => ({
    id: m.id, title: m.title, companyId: m.companyId, companyName: m.company?.name ?? null,
    commanderName: m.commanderSoldier?.fullName || m.commanderName || null,
    commanderSoldierId: m.commanderSoldierId,
    commanderNameRaw: m.commanderName,
    hasExternal: m.vehicles.some((v) => v.isExternal),
    hasUnqualifiedDriver: m.vehicles.some((v) => !v.isExternal && v.soldiers.some((s) => s.isDriver && s.soldierId && !driverQualified(s.soldierId, v.vehicleSerialUnit?.itemType.id ?? null))),
    missionDate: m.missionDate.toISOString().slice(0, 10), departureTime: m.departureTime, notes: m.notes,
    completedAt: m.completedAt?.toISOString() ?? null, startedAt: m.startedAt?.toISOString() ?? null, createdByName: m.createdBy.fullName,
    vehicles: m.vehicles.map((v) => ({
      isExternal: v.isExternal, vehicleSerialUnitId: v.vehicleSerialUnitId,
      externalVehicleNumber: v.externalVehicleNumber, externalVehicleTypeName: v.externalVehicleTypeName,
      label: v.isExternal
        ? `${v.externalVehicleTypeName || "רכב חוץ"} ${v.externalVehicleNumber || ""}`.trim()
        : `${v.vehicleSerialUnit?.itemType.name || "רכב"} · ${v.vehicleSerialUnit?.serialNumber || ""}`,
      typeName: v.isExternal ? (v.externalVehicleTypeName || "רכב חוץ") : (v.vehicleSerialUnit?.itemType.name || "רכב"),
      equipment: v.vehicleSerialUnitId ? (equipByVehicle.get(v.vehicleSerialUnitId) ?? []) : [],
      soldiers: v.soldiers.map((s) => ({
        vasId: s.id, soldierId: s.soldierId, externalName: s.externalName, externalPersonalNumber: s.externalPersonalNumber, isDriver: s.isDriver,
        name: s.soldier?.fullName || s.externalName || "—", pn: s.soldier?.personalNumber ?? s.externalPersonalNumber ?? null,
        tripConfirmedAt: s.tripConfirmedAt?.toISOString() ?? null, dispatchRoleId: s.dispatchRoleId ?? null,
      })),
    })),
  }));
  const vehiclesForMission = vehicles.map((v) => ({ id: v.id, name: v.itemType.name, serial: v.serialNumber, typeName: v.itemType.name, requiredLicenseIds: vtlMap[v.itemTypeId] ?? [] }));
  const soldiersForMission = soldiers.map((s) => {
    const procValid = !!s.drivingProcedureSignedAt && (!procUpdated || s.drivingProcedureSignedAt >= procUpdated);
    let refreshValid = false;
    if (s.drivingRefresherDate) { const exp = new Date(s.drivingRefresherDate); exp.setDate(exp.getDate() + refreshDays); refreshValid = exp.getTime() >= Date.now(); }
    return { id: s.id, fullName: s.fullName, personalNumber: s.personalNumber ?? "", licenseIds: s.drivingLicenses.map((dl) => dl.licenseType.id), procValid, refreshValid };
  });
  // כל תבנית פעילה — עם רכב ספציפי או רק סוג רכב (בוחרים את המספר בהמשך)
  const templatesForMission = templates.map((t) => ({
    id: t.id, name: t.name,
    vehicleSerialUnitId: t.vehicleSerialUnitId ?? "",
    vehicleTypeName: t.vehicleSerialUnit?.itemType.name ?? t.vehicleItemType?.name ?? "רכב",
    soldierIds: t.slots.filter((s) => s.soldier).map((s) => s.soldier!.id),
    soldiers: t.slots.filter((s) => s.soldier).map((s) => ({ soldierId: s.soldier!.id, dispatchRoleId: s.dispatchRoleId, isDriver: s.dispatchRole?.isDriver ?? false })),
  }));
  // מיפוי חייל → תפקידי שבצ"ק שהוא מוגדר בהם (מהשבצ"ק הקבוע) — "מותאמים לתפקיד"
  const soldierRoleMap: Record<string, string[]> = {};
  for (const t of templates) for (const slot of t.slots) {
    if (slot.soldier && slot.dispatchRole?.id) (soldierRoleMap[slot.soldier.id] ??= []).push(slot.dispatchRole.id);
  }

  return (
    <div>
      <PageHeader
        helpKey="dispatch"
        title="🚗 שבצ&quot;ק - משימות ורכבים"
        subtitle="פתיחת משימה (שיירה) עם רכב אחד או יותר. ניתן לצפייה ועריכה ע&quot;י כל המשתמשים."
      />


      <MissionsSection
        missions={missionsData}
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        vehicles={vehiclesForMission}
        soldiers={soldiersForMission}
        templates={templatesForMission}
        dispatchRoles={dispatchRoles}
        soldierRoleMap={soldierRoleMap}
        presentSoldierIds={presentSoldierIds}
        myCompanyId={effectiveCompanyId}
      />

      {vehicles.length === 0 && (
        <Card className="p-6">
          <EmptyState>
            <div className="space-y-2 text-center">
              <p>🚫 אין רכבים פעילים בגדוד.</p>
              <p className="text-sm">כדי ליצור משימה, יש לקלוט רכבים תחת קטגוריה ש-warehouseType=VEHICLES.</p>
            </div>
          </EmptyState>
        </Card>
      )}
    </div>
  );
}
