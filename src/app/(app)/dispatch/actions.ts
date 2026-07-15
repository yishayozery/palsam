"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { notifyMissionCreated } from "@/lib/dispatch-notify";
import { createOrUpdateMission, type MissionInput } from "@/lib/mission-core";
import { sendTelegramMessage } from "@/lib/telegram";
import { escapeTelegram } from "@/lib/escape-html";

/** 🔧 התראה לקצין רכב אם שובץ רכב לא-תקין למשימה — עם רשימת הנהגים. best-effort. */
async function notifyUnfitVehicles(bId: string, input: MissionInput): Promise<void> {
  try {
    const sysVehIds = input.vehicles.filter((v) => !v.isExternal && v.vehicleSerialUnitId).map((v) => v.vehicleSerialUnitId!) as string[];
    if (!sysVehIds.length) return;
    const units = await prisma.serialUnit.findMany({ where: { id: { in: sysVehIds } }, select: { serialNumber: true, itemType: { select: { name: true } }, status: { select: { name: true, isWear: true, isLoss: true } } } });
    const unfit = units.filter((u) => u.status.isWear || u.status.isLoss);
    if (!unfit.length) return;
    const bat = await prisma.battalion.findUnique({ where: { id: bId }, select: { telegramBotToken: true } });
    if (!bat?.telegramBotToken) return;
    // רשימת נהגים
    const driverSids = input.vehicles.flatMap((v) => v.soldiers.filter((s) => "soldierId" in s && s.soldierId && s.isDriver).map((s) => (s as { soldierId: string }).soldierId));
    const drivers = driverSids.length ? await prisma.soldier.findMany({ where: { id: { in: driverSids } }, select: { fullName: true, phone: true } }) : [];
    const driverList = drivers.map((d) => `${d.fullName}${d.phone ? ` · ${d.phone}` : ""}`).join("\n") || "—";
    // קציני רכב (role legacy WAREHOUSE_MANAGER, או הרשאת מסך רכב/שבצ"ק) עם צ'אט בוט מקושר
    const officers = await prisma.appUser.findMany({
      where: { battalionId: bId, active: true, soldier: { telegramChatId: { not: null } },
        OR: [{ role: "WAREHOUSE_MANAGER" }, { systemRole: { permissions: { some: { screen: { in: ["driving_licenses", "dispatch"] } } } } }] },
      select: { soldier: { select: { telegramChatId: true } } },
    });
    const chatIds = [...new Set(officers.map((o) => o.soldier?.telegramChatId).filter((c): c is string => !!c))];
    if (!chatIds.length) return;
    const vehList = unfit.map((u) => `🔧 ${escapeTelegram(u.itemType.name)} (${escapeTelegram(u.serialNumber)}) — ${escapeTelegram(u.status.name)}`).join("\n");
    const msg = `⚠️ <b>שובץ רכב לא-תקין למשימה</b>\n${vehList}\n\n<b>נהגים במשימה:</b>\n${escapeTelegram(driverList)}`;
    await Promise.all(chatIds.map((c) => sendTelegramMessage(bat.telegramBotToken!, c, msg).catch(() => {})));
  } catch { /* best-effort */ }
}

type SaveInput = {
  id?: string;
  vehicleSerialUnitId: string;
  missionDate: string; // YYYY-MM-DD
  departureTime: string; // HH:mm
  soldierIds: string[];
};

/** יצירה/עדכון של שיבוץ. כל המשתמשים יכולים. */
export async function saveAssignment(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string; id?: string }> {
  try {
    const user = await requireCapability("dispatch.manage");
    if (!user.battalionId) return { error: "אינך משויך לגדוד" };
    const bId = user.battalionId;

    const id = String(formData.get("id") || "").trim() || undefined;
    const vehicleSerialUnitId = String(formData.get("vehicleSerialUnitId") || "").trim();
    const missionDate = String(formData.get("missionDate") || "").trim();
    const departureTime = String(formData.get("departureTime") || "").trim();
    const soldierIdsRaw = String(formData.get("soldierIds") || "[]");
    let soldierIds: string[] = [];
    try { soldierIds = JSON.parse(soldierIdsRaw); } catch { return { error: "פורמט חיילים שגוי" }; }

    if (!vehicleSerialUnitId) return { error: "בחר רכב" };
    if (!missionDate) return { error: "בחר תאריך משימה" };
    if (!departureTime || !/^\d{2}:\d{2}$/.test(departureTime)) return { error: "הזן שעת יציאה בפורמט HH:mm" };
    if (soldierIds.length === 0) return { error: "הוסף לפחות חייל אחד" };

    // ולידציה: הרכב והחיילים בגדוד של המשתמש
    const vehicle = await prisma.serialUnit.findUnique({
      where: { id: vehicleSerialUnitId },
      select: { battalionId: true, itemType: { select: { category: { select: { warehouseType: true } } } } },
    });
    if (!vehicle || vehicle.battalionId !== bId) return { error: "רכב לא נמצא" };
    if (vehicle.itemType.category?.warehouseType !== "VEHICLES") return { error: "הפריט אינו רכב" };

    const validSoldierCount = await prisma.soldier.count({
      where: { id: { in: soldierIds }, battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] } },
    });
    if (validSoldierCount !== soldierIds.length) return { error: "חלק מהחיילים לא נמצאו בגדוד" };

    // companyId - נשתמש בפלוגה של החייל הראשון (לתצוגה בלבד; אפשר להישאר ריק)
    const firstSoldier = await prisma.soldier.findFirst({
      where: { id: { in: soldierIds }, battalionId: bId }, select: { companyId: true },
    });
    const companyId = firstSoldier?.companyId ?? null;

    const missionDateObj = new Date(missionDate + "T00:00:00.000Z");
    if (isNaN(missionDateObj.getTime())) return { error: "תאריך שגוי" };

    let savedId: string;
    if (id) {
      const existing = await prisma.vehicleAssignment.findUnique({ where: { id }, select: { battalionId: true } });
      if (!existing || existing.battalionId !== bId) return { error: "שיבוץ לא נמצא" };
      await prisma.$transaction(async (tx) => {
        await tx.vehicleAssignment.update({
          where: { id },
          data: {
            vehicleSerialUnitId, missionDate: missionDateObj, departureTime,
            companyId, updatedById: user.id,
          },
        });
        await tx.vehicleAssignmentSoldier.deleteMany({ where: { assignmentId: id } });
        for (const sid of soldierIds) {
          await tx.vehicleAssignmentSoldier.create({ data: { assignmentId: id, soldierId: sid } });
        }
      });
      savedId = id;
      await audit(user.id, "UPDATE", "VehicleAssignment", id, { vehicleSerialUnitId, soldierCount: soldierIds.length });
    } else {
      const created = await prisma.$transaction(async (tx) => {
        const a = await tx.vehicleAssignment.create({
          data: {
            battalionId: bId, companyId,
            vehicleSerialUnitId, missionDate: missionDateObj, departureTime,
            createdById: user.id,
          },
        });
        for (const sid of soldierIds) {
          await tx.vehicleAssignmentSoldier.create({ data: { assignmentId: a.id, soldierId: sid } });
        }
        return a;
      });
      savedId = created.id;
      await audit(user.id, "CREATE", "VehicleAssignment", savedId, { vehicleSerialUnitId, soldierCount: soldierIds.length });
    }
    revalidatePath("/dispatch");
    return { ok: true, id: savedId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** סימון/ביטול סימון של 'הסתיימה משימה'. */
export async function toggleAssignmentComplete(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string; completedAt?: string | null }> {
  try {
    const user = await requireCapability("dispatch.manage");
    const id = String(formData.get("id") || "");
    const setCompletedRaw = String(formData.get("completed") || "true");
    const setCompleted = setCompletedRaw === "true";
    if (!id) return { error: "חסר מזהה" };
    const existing = await prisma.vehicleAssignment.findUnique({
      where: { id }, select: { battalionId: true, completedAt: true },
    });
    if (!existing || existing.battalionId !== user.battalionId) return { error: "שיבוץ לא נמצא" };
    const completedAt = setCompleted ? new Date() : null;
    await prisma.vehicleAssignment.update({
      where: { id },
      data: { completedAt, completedById: setCompleted ? user.id : null },
    });
    await audit(user.id, setCompleted ? "MISSION_COMPLETE" : "MISSION_REOPEN", "VehicleAssignment", id);
    revalidatePath("/dispatch");
    return { ok: true, completedAt: completedAt?.toISOString() ?? null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** מחיקת שיבוץ. כל המשתמשים יכולים. */
export async function deleteAssignment(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireCapability("dispatch.manage");
    const id = String(formData.get("id") || "");
    if (!id) return { error: "חסר מזהה" };
    const existing = await prisma.vehicleAssignment.findUnique({ where: { id }, select: { battalionId: true } });
    if (!existing || existing.battalionId !== user.battalionId) return { error: "שיבוץ לא נמצא" };
    await prisma.vehicleAssignment.delete({ where: { id } });
    await audit(user.id, "DELETE", "VehicleAssignment", id);
    revalidatePath("/dispatch");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

// ===================== משימות רב-רכביות (Mission) =====================
// לוגיקת היצירה/עדכון עברה ל-src/lib/mission-core.ts (משותפת עם הבוט).

/** יצירה/עדכון של משימה רב-רכבית (שיירה). כולל רכבי-חוץ וחיילי-חוץ. */
export async function saveMission(formData: FormData): Promise<{ ok?: boolean; error?: string; id?: string }> {
  try {
    const user = await requireCapability("dispatch.manage");
    if (!user.battalionId) return { error: "אינך משויך לגדוד" };
    const bId = user.battalionId;

    let input: MissionInput;
    try { input = JSON.parse(String(formData.get("payload") || "")); } catch { return { error: "פורמט נתונים שגוי" }; }

    const res = await createOrUpdateMission(bId, user.id, input);
    if ("error" in res) return { error: res.error };

    await audit(user.id, res.isNew ? "CREATE" : "UPDATE", "Mission", res.id, { vehicles: input.vehicles.length });
    if (res.isNew) await notifyMissionCreated(res.id, bId); // התראות בוט — רק ביצירה
    await notifyUnfitVehicles(bId, input); // 🔧 התראת רכב לא-תקין לקצין רכב (עם רשימת נהגים)
    revalidatePath("/dispatch");
    return { ok: true, id: res.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** סימון/ביטול סיום משימה שלמה. */
export async function toggleMissionComplete(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireCapability("dispatch.manage");
    const id = String(formData.get("id") || "");
    const setCompleted = String(formData.get("completed") || "true") === "true";
    if (!id) return { error: "חסר מזהה" };
    const m = await prisma.mission.findUnique({ where: { id }, select: { battalionId: true } });
    if (!m || m.battalionId !== user.battalionId) return { error: "משימה לא נמצאה" };
    const completedAt = setCompleted ? new Date() : null;
    await prisma.$transaction([
      prisma.mission.update({ where: { id }, data: { completedAt, completedById: setCompleted ? user.id : null } }),
      prisma.vehicleAssignment.updateMany({ where: { missionId: id }, data: { completedAt, completedById: setCompleted ? user.id : null } }),
    ]);
    await audit(user.id, setCompleted ? "MISSION_COMPLETE" : "MISSION_REOPEN", "Mission", id);
    revalidatePath("/dispatch");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** דיווח/ביטול הקמת הרשאת נסיעה ע"י נהג (ידני מהמסך — קצין רכב/מפקד). */
export async function toggleTripConfirmed(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireCapability("dispatch.manage");
    const vasId = String(formData.get("vasId") || "");
    const confirmed = String(formData.get("confirmed") || "true") === "true";
    if (!vasId) return { error: "חסר מזהה" };
    const vas = await prisma.vehicleAssignmentSoldier.findUnique({
      where: { id: vasId },
      select: { id: true, assignment: { select: { battalionId: true } } },
    });
    if (!vas || vas.assignment.battalionId !== user.battalionId) return { error: "שיבוץ לא נמצא" };
    await prisma.vehicleAssignmentSoldier.update({
      where: { id: vasId },
      data: { tripConfirmedAt: confirmed ? new Date() : null, tripConfirmedVia: confirmed ? `${user.fullName} (ידני)` : null },
    });
    revalidatePath("/dispatch");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** התחלת משימה — נחסמת עד שכל הנהגים (רכב מערכת) דיווחו שהקימו הרשאת נסיעה. */
export async function startMission(formData: FormData): Promise<{ ok?: boolean; error?: string; missing?: string[] }> {
  try {
    const user = await requireCapability("dispatch.manage");
    const id = String(formData.get("id") || "");
    const force = String(formData.get("force") || "") === "true";
    if (!id) return { error: "חסר מזהה" };
    const m = await prisma.mission.findUnique({
      where: { id },
      select: {
        battalionId: true, startedAt: true,
        vehicles: { select: { isExternal: true, soldiers: { select: { isDriver: true, soldierId: true, tripConfirmedAt: true, soldier: { select: { fullName: true } } } } } },
      },
    });
    if (!m || m.battalionId !== user.battalionId) return { error: "משימה לא נמצאה" };
    // נהגי רכב-מערכת שטרם דיווחו הקמת הרשאה (רכב חוץ מדולג)
    const missing = m.vehicles
      .filter((v) => !v.isExternal)
      .flatMap((v) => v.soldiers.filter((s) => s.isDriver && s.soldierId && !s.tripConfirmedAt))
      .map((s) => s.soldier?.fullName || "נהג");
    if (missing.length > 0 && !force) {
      return { error: `נהגים שטרם דיווחו הקמת הרשאה: ${missing.join(", ")}`, missing };
    }
    await prisma.mission.update({ where: { id }, data: { startedAt: new Date(), startedById: user.id } });
    await audit(user.id, "MISSION_START", "Mission", id, { forced: force, missing });
    revalidatePath("/dispatch");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** מחיקת משימה (כולל כל הרכבים שלה — cascade). */
export async function deleteMission(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireCapability("dispatch.manage");
    const id = String(formData.get("id") || "");
    if (!id) return { error: "חסר מזהה" };
    const m = await prisma.mission.findUnique({ where: { id }, select: { battalionId: true } });
    if (!m || m.battalionId !== user.battalionId) return { error: "משימה לא נמצאה" };
    await prisma.mission.delete({ where: { id } });
    await audit(user.id, "DELETE", "Mission", id);
    revalidatePath("/dispatch");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}
