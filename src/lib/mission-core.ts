import { prisma } from "@/lib/prisma";

/** קלט משימה משותף — למסך המערכת ולבוט הטלגרם (אותו תהליך פתיחת משימה). */
export type MissionSoldierInput =
  | { soldierId: string; isDriver?: boolean; dispatchRoleId?: string | null }
  | { externalName: string; externalPersonalNumber?: string; isDriver?: boolean; dispatchRoleId?: string | null };

export type MissionVehicleInput = {
  vehicleSerialUnitId?: string | null; // רכב מהמערכת
  isExternal?: boolean;
  externalVehicleNumber?: string | null;
  externalVehicleTypeName?: string | null;
  soldiers: MissionSoldierInput[];
};

export type MissionInput = {
  id?: string;
  title?: string | null;
  companyId?: string | null;
  commanderSoldierId?: string | null;
  commanderName?: string | null;
  missionDate: string; // YYYY-MM-DD
  departureTime: string; // HH:mm
  notes?: string | null;
  vehicles: MissionVehicleInput[];
};

/**
 * ולידציה + יצירה/עדכון של משימה רב-רכבית (שיירה).
 * לוגיקה משותפת בין saveMission (מסך) ל-POST של הבוט — כדי שהבוט יפתח משימה זהה.
 * לא מבצע audit/notify/revalidate — הקורא אחראי לזה (שונה בין הקשרים).
 */
export async function createOrUpdateMission(
  bId: string,
  createdById: string,
  input: MissionInput,
): Promise<{ id: string; isNew: boolean } | { error: string }> {
  if (!input.missionDate) return { error: "בחר תאריך משימה" };
  if (!input.departureTime || !/^\d{2}:\d{2}$/.test(input.departureTime)) return { error: "הזן שעת יציאה בפורמט HH:mm" };
  if (!Array.isArray(input.vehicles) || input.vehicles.length === 0) return { error: "הוסף לפחות רכב אחד" };

  // ולידציה של כל רכב — עם ציון מספר הרכב בשגיאה
  for (let vi = 0; vi < input.vehicles.length; vi++) {
    const v = input.vehicles[vi];
    const label = `רכב ${vi + 1}`;
    const external = v.isExternal || !v.vehicleSerialUnitId;
    if (external) {
      if (!v.externalVehicleNumber?.trim()) return { error: `${label} (חוץ) — חסר מספר רכב` };
    } else {
      const veh = await prisma.serialUnit.findUnique({
        where: { id: v.vehicleSerialUnitId! },
        select: { battalionId: true, itemType: { select: { category: { select: { warehouseType: true } } } } },
      });
      if (!veh || veh.battalionId !== bId) return { error: `${label} — הרכב לא נמצא בגדוד` };
      if (veh.itemType.category?.warehouseType !== "VEHICLES") return { error: `${label} — הפריט אינו רכב` };
    }
    if (!Array.isArray(v.soldiers) || v.soldiers.length === 0) return { error: `${label} — חייב לפחות חייל אחד` };
    const sysIds = v.soldiers.filter((s): s is { soldierId: string } => "soldierId" in s && !!s.soldierId).map((s) => s.soldierId);
    if (sysIds.length) {
      const cnt = await prisma.soldier.count({ where: { id: { in: sysIds }, battalionId: bId } });
      if (cnt !== sysIds.length) return { error: "חלק מהחיילים לא נמצאו בגדוד" };
    }
    for (const s of v.soldiers) {
      if (!("soldierId" in s && s.soldierId) && !("externalName" in s && s.externalName?.trim())) {
        return { error: "חייל חוץ — חסר שם" };
      }
    }
  }

  // 🚫 מניעת שיבוץ כפול — אותו חייל לא יכול להיות ביותר מרכב אחד באותה משימה
  const allSids = input.vehicles.flatMap((v) => v.soldiers.filter((s): s is { soldierId: string } => "soldierId" in s && !!s.soldierId).map((s) => s.soldierId));
  const dupId = allSids.find((id, i) => allSids.indexOf(id) !== i);
  if (dupId) {
    const dup = await prisma.soldier.findUnique({ where: { id: dupId }, select: { fullName: true } });
    return { error: `🚫 שיבוץ כפול — ${dup?.fullName ?? "חייל"} משובץ ליותר מרכב אחד באותה משימה` };
  }

  const missionDateObj = new Date(input.missionDate + "T00:00:00.000Z");
  if (isNaN(missionDateObj.getTime())) return { error: "תאריך שגוי" };
  const companyId = input.companyId?.trim() || null;
  const title = input.title?.trim() || null;
  const notes = input.notes?.trim() || null;
  const commanderSoldierId = input.commanderSoldierId?.trim() || null;
  const commanderName = input.commanderName?.trim() || null;
  const commanderData = { commanderSoldierId, commanderName };

  const buildVehicleData = (missionId: string) => input.vehicles.map((v, vi) => {
    const external = v.isExternal || !v.vehicleSerialUnitId;
    return {
      battalionId: bId, companyId, missionId,
      missionDate: missionDateObj, departureTime: input.departureTime,
      createdById, convoyOrder: vi, // סדר בשיירה = סדר השורות במסך
      vehicleSerialUnitId: external ? null : v.vehicleSerialUnitId!,
      isExternal: external,
      externalVehicleNumber: external ? (v.externalVehicleNumber?.trim() || null) : null,
      externalVehicleTypeName: external ? (v.externalVehicleTypeName?.trim() || null) : null,
      soldiers: v.soldiers.map((s) =>
        "soldierId" in s && s.soldierId
          ? { soldierId: s.soldierId, isDriver: !!s.isDriver, dispatchRoleId: s.dispatchRoleId ?? null }
          : { soldierId: null, isDriver: !!s.isDriver, dispatchRoleId: s.dispatchRoleId ?? null, externalName: (s as { externalName: string }).externalName.trim(), externalPersonalNumber: (s as { externalPersonalNumber?: string }).externalPersonalNumber?.trim() || null }),
    };
  });

  if (input.id) {
    const existing = await prisma.mission.findUnique({ where: { id: input.id }, select: { battalionId: true } });
    if (!existing || existing.battalionId !== bId) return { error: "משימה לא נמצאה" };
    await prisma.$transaction(async (tx) => {
      await tx.mission.update({ where: { id: input.id! }, data: { title, companyId, ...commanderData, missionDate: missionDateObj, departureTime: input.departureTime, notes } });
      await tx.vehicleAssignment.deleteMany({ where: { missionId: input.id! } });
      for (const vd of buildVehicleData(input.id!)) {
        const { soldiers, ...va } = vd;
        const created = await tx.vehicleAssignment.create({ data: va });
        for (const s of soldiers) await tx.vehicleAssignmentSoldier.create({ data: { assignmentId: created.id, ...s } });
      }
    });
    return { id: input.id, isNew: false };
  }

  const mission = await prisma.$transaction(async (tx) => {
    const m = await tx.mission.create({ data: { battalionId: bId, title, companyId, ...commanderData, missionDate: missionDateObj, departureTime: input.departureTime, notes, createdById } });
    for (const vd of buildVehicleData(m.id)) {
      const { soldiers, ...va } = vd;
      const created = await tx.vehicleAssignment.create({ data: va });
      for (const s of soldiers) await tx.vehicleAssignmentSoldier.create({ data: { assignmentId: created.id, ...s } });
    }
    return m;
  });
  return { id: mission.id, isNew: true };
}
