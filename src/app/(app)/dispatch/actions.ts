"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

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

const DEFAULT_TRIP_LINK = "https://share.google/ynXRw9qVmG2TNOk7u";

/** התראות ביצירת משימה: הודעת בוט לכל נהג משובץ + ידיעה לקצין רכב עם נהגים ורכבים. לא-חוסם. */
async function notifyMissionCreated(missionId: string, bId: string): Promise<void> {
  try {
    const mission = await prisma.mission.findUnique({
      where: { id: missionId },
      include: {
        battalion: { select: { telegramBotToken: true, tripLink: true } },
        commanderSoldier: { select: { fullName: true, telegramChatId: true } },
        vehicles: {
          include: {
            vehicleSerialUnit: { select: { serialNumber: true, itemType: { select: { name: true } } } },
            soldiers: { include: { soldier: { select: { fullName: true, telegramChatId: true } } } },
          },
        },
      },
    });
    const token = mission?.battalion.telegramBotToken;
    if (!mission || !token) return;
    const link = mission.battalion.tripLink?.trim() || DEFAULT_TRIP_LINK;
    const dateStr = mission.missionDate.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" });
    const { sendTelegramMessage } = await import("@/lib/telegram");

    const vehicleLabel = (v: (typeof mission.vehicles)[number]) =>
      v.isExternal
        ? `${v.externalVehicleTypeName || "רכב חוץ"} ${v.externalVehicleNumber || ""}`.trim()
        : `${v.vehicleSerialUnit?.itemType.name || "רכב"} ${v.vehicleSerialUnit?.serialNumber || ""}`.trim();

    // 1. הודעה לכל נהג משובץ + כפתור "הקמתי לינק/הרשאה" + איסוף שורות סיכום לקצין רכב
    const driverLines: string[] = [];
    const officerButtons: { text: string; callback_data: string }[][] = [];
    for (const v of mission.vehicles) {
      const vName = vehicleLabel(v);
      for (const s of v.soldiers) {
        if (!s.isDriver) continue;
        const name = s.soldier?.fullName || s.externalName || "נהג";
        driverLines.push(`• ${vName} — ${name}`);
        // כפתור לקצין הרכב לאשר בשם הנהג (רק לרכב מערכת עם נהג מהמערכת)
        if (s.soldierId) officerButtons.push([{ text: `✅ ${name} — ${vName}`, callback_data: `tripok:${s.id}` }]);
        if (s.soldier?.telegramChatId) {
          const text = `🚗 <b>שובצת למשימת נסיעה</b>\nתאריך: ${dateStr} · שעה: ${mission.departureTime}\nרכב: ${vName}\n\nיש לפתוח משימת נסיעה בקישור:\n${link}\n\n<b>לאחר שהקמת את ההרשאה/לינק — לחץ על הכפתור לדיווח.</b>`;
          await sendTelegramMessage(token, s.soldier.telegramChatId, text, {
            inline_keyboard: [[{ text: "✅ הקמתי הרשאת נסיעה", callback_data: `tripok:${s.id}` }]],
          });
        }
      }
    }

    // 2. ידיעה לקצין הרכב (מנהל מחסן רכבים) — נהגים ורכבים + כפתורי אישור בשם הנהג
    if (driverLines.length) {
      const officers = await prisma.appUser.findMany({
        where: {
          battalionId: bId, active: true, soldier: { is: { telegramChatId: { not: null } } },
          OR: [{ holder: { warehouseType: "VEHICLES" } }, { assignedHolders: { some: { holder: { warehouseType: "VEHICLES" } } } }],
        },
        select: { soldier: { select: { telegramChatId: true } } },
      });
      const summary = `🚚 <b>נפתחה משימת נסיעה</b>\nתאריך: ${dateStr} · שעה: ${mission.departureTime}${mission.title ? `\nמשימה: ${mission.title}` : ""}\n\n<b>רכבים ונהגים:</b>\n${driverLines.join("\n")}\n\nניתן לאשר הקמת הרשאה בשם נהג בכפתורים:`;
      const seen = new Set<string>();
      for (const o of officers) {
        const chatId = o.soldier?.telegramChatId;
        if (chatId && !seen.has(chatId)) {
          seen.add(chatId);
          await sendTelegramMessage(token, chatId, summary, officerButtons.length ? { inline_keyboard: officerButtons } : undefined);
        }
      }
    }

    // 3. הודעה למפקד המשימה — עם כפתור "סיים משימה" בבוט
    if (mission.commanderSoldier?.telegramChatId) {
      const cText = `👤 <b>הוגדרת כמפקד משימה</b>\nמשימה: ${mission.title || "נסיעה"}\nתאריך: ${dateStr} · שעה: ${mission.departureTime}\n\nבסיום המשימה — לחץ על הכפתור לסגירתה.`;
      await sendTelegramMessage(token, mission.commanderSoldier.telegramChatId, cText, {
        inline_keyboard: [[{ text: "✅ סיים משימה", callback_data: `mclose:${mission.id}` }]],
      });
    }
  } catch (e) {
    console.error("[notifyMissionCreated] failed (non-fatal):", e);
  }
}

type MissionSoldierInput =
  | { soldierId: string; isDriver?: boolean }
  | { externalName: string; externalPersonalNumber?: string; isDriver?: boolean };

type MissionVehicleInput = {
  vehicleSerialUnitId?: string | null; // רכב מהמערכת
  isExternal?: boolean;
  externalVehicleNumber?: string | null;
  externalVehicleTypeName?: string | null;
  soldiers: MissionSoldierInput[];
};

type MissionInput = {
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

/** יצירה/עדכון של משימה רב-רכבית (שיירה). כולל רכבי-חוץ וחיילי-חוץ. */
export async function saveMission(formData: FormData): Promise<{ ok?: boolean; error?: string; id?: string }> {
  try {
    const user = await requireCapability("dispatch.manage");
    if (!user.battalionId) return { error: "אינך משויך לגדוד" };
    const bId = user.battalionId;

    let input: MissionInput;
    try { input = JSON.parse(String(formData.get("payload") || "")); } catch { return { error: "פורמט נתונים שגוי" }; }

    if (!input.missionDate) return { error: "בחר תאריך משימה" };
    if (!input.departureTime || !/^\d{2}:\d{2}$/.test(input.departureTime)) return { error: "הזן שעת יציאה בפורמט HH:mm" };
    if (!Array.isArray(input.vehicles) || input.vehicles.length === 0) return { error: "הוסף לפחות רכב אחד" };

    // ולידציה של כל רכב
    for (const v of input.vehicles) {
      const external = v.isExternal || !v.vehicleSerialUnitId;
      if (external) {
        if (!v.externalVehicleNumber?.trim()) return { error: "רכב חוץ — חסר מספר רכב" };
      } else {
        const veh = await prisma.serialUnit.findUnique({
          where: { id: v.vehicleSerialUnitId! },
          select: { battalionId: true, itemType: { select: { category: { select: { warehouseType: true } } } } },
        });
        if (!veh || veh.battalionId !== bId) return { error: "רכב לא נמצא בגדוד" };
        if (veh.itemType.category?.warehouseType !== "VEHICLES") return { error: "הפריט אינו רכב" };
      }
      if (!Array.isArray(v.soldiers) || v.soldiers.length === 0) return { error: "כל רכב חייב לפחות חייל אחד" };
      // ולידציה של חיילי מערכת
      const sysIds = v.soldiers.filter((s): s is { soldierId: string } => "soldierId" in s && !!s.soldierId).map((s) => s.soldierId);
      if (sysIds.length) {
        const cnt = await prisma.soldier.count({ where: { id: { in: sysIds }, battalionId: bId } });
        if (cnt !== sysIds.length) return { error: "חלק מהחיילים לא נמצאו בגדוד" };
      }
      // חיילי חוץ חייבים שם
      for (const s of v.soldiers) {
        if (!("soldierId" in s && s.soldierId) && !("externalName" in s && s.externalName?.trim())) {
          return { error: "חייל חוץ — חסר שם" };
        }
      }
    }

    const missionDateObj = new Date(input.missionDate + "T00:00:00.000Z");
    if (isNaN(missionDateObj.getTime())) return { error: "תאריך שגוי" };
    const companyId = input.companyId?.trim() || null;
    const title = input.title?.trim() || null;
    const notes = input.notes?.trim() || null;
    const commanderSoldierId = input.commanderSoldierId?.trim() || null;
    const commanderName = input.commanderName?.trim() || null;
    const commanderData = { commanderSoldierId, commanderName };

    const buildVehicleData = (missionId: string) => input.vehicles.map((v) => {
      const external = v.isExternal || !v.vehicleSerialUnitId;
      return {
        battalionId: bId, companyId, missionId,
        missionDate: missionDateObj, departureTime: input.departureTime,
        createdById: user.id,
        vehicleSerialUnitId: external ? null : v.vehicleSerialUnitId!,
        isExternal: external,
        externalVehicleNumber: external ? (v.externalVehicleNumber?.trim() || null) : null,
        externalVehicleTypeName: external ? (v.externalVehicleTypeName?.trim() || null) : null,
        soldiers: v.soldiers.map((s) =>
          "soldierId" in s && s.soldierId
            ? { soldierId: s.soldierId, isDriver: !!s.isDriver }
            : { soldierId: null, isDriver: !!s.isDriver, externalName: (s as { externalName: string }).externalName.trim(), externalPersonalNumber: (s as { externalPersonalNumber?: string }).externalPersonalNumber?.trim() || null }),
      };
    });

    let savedId: string;
    if (input.id) {
      const existing = await prisma.mission.findUnique({ where: { id: input.id }, select: { battalionId: true } });
      if (!existing || existing.battalionId !== bId) return { error: "משימה לא נמצאה" };
      await prisma.$transaction(async (tx) => {
        await tx.mission.update({ where: { id: input.id! }, data: { title, companyId, ...commanderData, missionDate: missionDateObj, departureTime: input.departureTime, notes } });
        // מוחקים ובונים מחדש את הרכבים (פשוט ואמין)
        await tx.vehicleAssignment.deleteMany({ where: { missionId: input.id! } });
        for (const vd of buildVehicleData(input.id!)) {
          const { soldiers, ...va } = vd;
          const created = await tx.vehicleAssignment.create({ data: va });
          for (const s of soldiers) await tx.vehicleAssignmentSoldier.create({ data: { assignmentId: created.id, ...s } });
        }
      });
      savedId = input.id;
      await audit(user.id, "UPDATE", "Mission", savedId, { vehicles: input.vehicles.length });
    } else {
      const mission = await prisma.$transaction(async (tx) => {
        const m = await tx.mission.create({ data: { battalionId: bId, title, companyId, ...commanderData, missionDate: missionDateObj, departureTime: input.departureTime, notes, createdById: user.id } });
        for (const vd of buildVehicleData(m.id)) {
          const { soldiers, ...va } = vd;
          const created = await tx.vehicleAssignment.create({ data: va });
          for (const s of soldiers) await tx.vehicleAssignmentSoldier.create({ data: { assignmentId: created.id, ...s } });
        }
        return m;
      });
      savedId = mission.id;
      await audit(user.id, "CREATE", "Mission", savedId, { vehicles: input.vehicles.length });
      // התראות בוט — רק ביצירה (לא בעריכה, כדי לא להציף)
      await notifyMissionCreated(savedId, bId);
    }
    revalidatePath("/dispatch");
    return { ok: true, id: savedId };
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
