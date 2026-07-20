"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability, requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export async function saveLicenseType(formData: FormData) {
  const user = await requireCapability("dispatch.manage");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const kindRaw = String(formData.get("kind") || "").trim().toUpperCase();
  const kind = kindRaw === "LICENSE" ? "LICENSE" : kindRaw === "PERMIT" ? "PERMIT" : undefined;
  if (!name) return;

  if (id) {
    const existing = await prisma.drivingLicenseType.findUnique({ where: { id } });
    if (!existing || existing.battalionId !== bId) return;
    await prisma.drivingLicenseType.update({ where: { id }, data: { name, ...(kind ? { kind } : {}) } });
  } else {
    await prisma.drivingLicenseType.create({ data: { battalionId: bId, name, ...(kind ? { kind } : {}) } });
  }
  await audit(user.id, "UPSERT", "DrivingLicenseType", id || "new", { name });
  revalidatePath("/driving-licenses");
}

export async function toggleLicenseType(formData: FormData) {
  const user = await requireCapability("dispatch.manage");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const existing = await prisma.drivingLicenseType.findUnique({ where: { id } });
  if (!existing || existing.battalionId !== bId) return;
  await prisma.drivingLicenseType.update({ where: { id }, data: { active: !existing.active } });
  await audit(user.id, "TOGGLE", "DrivingLicenseType", id);
  revalidatePath("/driving-licenses");
}

export async function saveSoldierLicenses(formData: FormData) {
  const user = await requireUser();
  const bId = user.battalionId!;
  const isAdmin = can(user, "battalion.profile");
  const isVehicleOfficer = user.role === "WAREHOUSE_MANAGER";
  if (!isAdmin && !isVehicleOfficer && !can(user, "dispatch.manage")) return;

  const soldierId = String(formData.get("soldierId") || "");
  const soldier = await prisma.soldier.findUnique({ where: { id: soldierId } });
  if (!soldier || soldier.battalionId !== bId) return;

  const licenseTypeIds = formData.getAll("licenseTypeId").map(String);
  const refresherDate = String(formData.get("refresherDate") || "");

  await prisma.$transaction(async (tx) => {
    await tx.soldierDrivingLicense.deleteMany({ where: { soldierId } });
    if (licenseTypeIds.length > 0) {
      await tx.soldierDrivingLicense.createMany({
        data: licenseTypeIds.map((licenseTypeId) => ({
          soldierId,
          licenseTypeId,
        })),
      });
    }
    await tx.soldier.update({
      where: { id: soldierId },
      data: { drivingRefresherDate: refresherDate ? new Date(refresherDate) : null },
    });
  });
  await audit(user.id, "UPDATE_LICENSES", "Soldier", soldierId, { count: licenseTypeIds.length });
  revalidatePath("/driving-licenses");
}

export async function updateRefreshDays(formData: FormData) {
  const user = await requireUser();
  if (!can(user, "battalion.profile")) return;
  const bId = user.battalionId!;
  const days = parseInt(String(formData.get("days") || "180"), 10);
  if (isNaN(days) || days < 1) return;
  await prisma.battalion.update({ where: { id: bId }, data: { drivingRefreshDays: days } });
  await audit(user.id, "UPDATE", "Battalion", bId, { drivingRefreshDays: days });
  revalidatePath("/driving-licenses");
}

/** קצין רכב/אדמין: שמירת נוסח נוהל הנהיגה שנשלח לחתימה. */
export async function saveDrivingProcedureText(formData: FormData) {
  const user = await requireUser();
  const isAdmin = can(user, "battalion.profile");
  const isVehicleOfficer = user.role === "WAREHOUSE_MANAGER";
  if (!isAdmin && !isVehicleOfficer && !can(user, "dispatch.manage")) return;
  const bId = user.battalionId!;
  const text = String(formData.get("text") || "").trim() || null;
  const current = await prisma.battalion.findUnique({ where: { id: bId }, select: { drivingProcedureText: true } });
  const changed = (current?.drivingProcedureText ?? null) !== text;
  await prisma.battalion.update({
    where: { id: bId },
    // עדכון הנוסח = גרסה חדשה → מרעננים את חותם-הזמן, וכל חתימה ישנה נחשבת לא-תקפה
    data: { drivingProcedureText: text, ...(changed ? { drivingProcedureUpdatedAt: new Date() } : {}) },
  });
  await audit(user.id, "UPDATE", "Battalion", bId, { drivingProcedureText: !!text, versionBumped: changed });
  revalidatePath("/driving-licenses");
}

/** שליחת נוהל הנהיגה כהנחיה חד-פעמית בבוט — לכל הנהגים ולכל המ"פים. */
export async function broadcastDrivingProcedure() {
  const user = await requireUser();
  const isAdmin = can(user, "battalion.profile");
  const isVehicleOfficer = user.role === "WAREHOUSE_MANAGER";
  if (!isAdmin && !isVehicleOfficer && !can(user, "dispatch.manage")) return { error: "אין הרשאה" };
  const bId = user.battalionId!;

  const battalion = await prisma.battalion.findUnique({ where: { id: bId }, select: { telegramBotToken: true, name: true, drivingProcedureText: true } });
  if (!battalion?.telegramBotToken) return { error: "לגדוד אין בוט" };
  if (!battalion.drivingProcedureText) return { error: "אין נוסח נוהל — שמור נוסח קודם" };

  // נהגים (רישיון/היתר או רישיון אזרחי) + מפקדי פלוגות — מחוברים לבוט
  const recipients = await prisma.soldier.findMany({
    where: {
      battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] }, telegramChatId: { not: null },
      OR: [{ drivingLicenses: { some: {} } }, { civilianLicenseNumber: { not: null } }, { companyRole: { isCommander: true } }],
    },
    select: { telegramChatId: true },
  });
  const chatIds = [...new Set(recipients.map((r) => r.telegramChatId!).filter(Boolean))];
  if (chatIds.length === 0) return { ok: true, sent: 0 };

  const { sendTelegramMessage } = await import("@/lib/telegram");
  const text = [`📖 <b>נוהל נהיגה — ${battalion.name}</b>`, ``, battalion.drivingProcedureText].join("\n");
  let sent = 0;
  for (let i = 0; i < chatIds.length; i += 20) {
    const batch = chatIds.slice(i, i + 20);
    const res = await Promise.allSettled(batch.map((c) => sendTelegramMessage(battalion.telegramBotToken!, c, text, undefined, "BULK")));
    sent += res.filter((r) => r.status === "fulfilled").length;
  }
  await audit(user.id, "BROADCAST_DRIVING_PROCEDURE", "Battalion", bId, { sent });
  return { ok: true, sent };
}

/** סימון ידני שחייל חתם על נוהל נהיגה (ע"י קצין רכב). toggle. */
export async function markProcedureSigned(formData: FormData) {
  const user = await requireUser();
  const isAdmin = can(user, "battalion.profile");
  const isVehicleOfficer = user.role === "WAREHOUSE_MANAGER";
  if (!isAdmin && !isVehicleOfficer && !can(user, "dispatch.manage")) return;
  const bId = user.battalionId!;
  const soldierId = String(formData.get("soldierId") || "");
  const s = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { battalionId: true, drivingProcedureSignedAt: true } });
  if (!s || s.battalionId !== bId) return;
  await prisma.soldier.update({ where: { id: soldierId }, data: { drivingProcedureSignedAt: s.drivingProcedureSignedAt ? null : new Date() } });
  await audit(user.id, "PROCEDURE_SIGN_MANUAL", "Soldier", soldierId);
  revalidatePath("/driving-licenses");
}

/** שליחת נוהל נהיגה לחייל בבוט לחתימה (כפתור inline). */
export async function sendDrivingProcedureForSign(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const user = await requireUser();
  const isAdmin = can(user, "battalion.profile");
  const isVehicleOfficer = user.role === "WAREHOUSE_MANAGER";
  if (!isAdmin && !isVehicleOfficer && !can(user, "dispatch.manage")) return { error: "אין הרשאה" };
  const bId = user.battalionId!;
  const soldierId = String(formData.get("soldierId") || "");
  const [soldier, battalion] = await Promise.all([
    prisma.soldier.findUnique({ where: { id: soldierId }, select: { battalionId: true, telegramChatId: true, fullName: true } }),
    prisma.battalion.findUnique({ where: { id: bId }, select: { telegramBotToken: true, drivingProcedureText: true } }),
  ]);
  if (!soldier || soldier.battalionId !== bId) return { error: "חייל לא נמצא" };
  if (!battalion?.telegramBotToken) return { error: "לא הוגדר בוט טלגרם" };
  if (!battalion.drivingProcedureText) return { error: "לא הוגדר נוסח נוהל נהיגה" };
  if (!soldier.telegramChatId) return { error: "החייל לא מחובר לבוט" };
  const { sendTelegramMessage } = await import("@/lib/telegram");
  const text = `🚗 <b>נוהל נהיגה — לחתימה</b>\n\n${battalion.drivingProcedureText}\n\nיש לאשר קריאה וחתימה:`;
  await sendTelegramMessage(battalion.telegramBotToken, soldier.telegramChatId, text, {
    inline_keyboard: [[{ text: "✍️ אני מאשר וחותם", callback_data: `signproc:${soldierId}` }]],
  });
  await audit(user.id, "PROCEDURE_SEND", "Soldier", soldierId);
  return { ok: true };
}

export async function saveVehicleTypeLicenses(formData: FormData) {
  const user = await requireUser();
  const bId = user.battalionId!;
  const isAdmin = can(user, "battalion.profile");
  const isVehicleOfficer = user.role === "WAREHOUSE_MANAGER";
  if (!isAdmin && !isVehicleOfficer && !can(user, "dispatch.manage")) return;

  const itemTypeId = String(formData.get("itemTypeId") || "");
  const itemType = await prisma.itemType.findUnique({ where: { id: itemTypeId } });
  if (!itemType || itemType.battalionId !== bId) return;

  const licenseTypeIds = formData.getAll("licenseTypeId").map(String);

  await prisma.$transaction(async (tx) => {
    await tx.vehicleTypeLicense.deleteMany({ where: { itemTypeId } });
    if (licenseTypeIds.length > 0) {
      await tx.vehicleTypeLicense.createMany({
        data: licenseTypeIds.map((licenseTypeId) => ({
          itemTypeId,
          licenseTypeId,
        })),
      });
    }
  });
  await audit(user.id, "UPDATE_VEHICLE_LICENSES", "ItemType", itemTypeId, { count: licenseTypeIds.length });
  revalidatePath("/driving-licenses");
}

// ===================== 🔄 רישום מרוכז להדרכה =====================
// קצין הרכב מקיש מ.א, המערכת מחזירה שם, והוא רושם עשרות אנשים במכה.
// "ריענון נהיגה" מעדכן את Soldier.drivingRefresherDate; כל שאר ההדרכות
// נרשמות כמופע קורס (CourseInstance) עם שיבוצים שסומנו כהושלמו — שם
// יש להן תיעוד אמיתי, ולא שדה נוסף על החייל לכל סוג הדרכה.

const DRIVING_REFRESH = "__driving_refresh__";

/**
 * גישה לרישום מרוכז.
 * ⚠️ חייב EDIT ולא VIEW: `can()` מחזיר true לכל רמת הרשאה, כולל VIEW, ולכן
 * תפקידים לקריאה-בלבד (קה"ד, מפקד מחלקה) היו יכולים להעניק רישיונות נהיגה
 * והסמכות לכל חייל בגדוד — הפעולה כותבת SoldierDrivingLicense ו-SoldierCertification.
 */
async function requireBulkTrainer() {
  const user = await requireUser();
  const { canEdit } = await import("@/lib/rbac");
  const ok = user.isAdmin
    || canEdit(user, "driving_licenses")
    || canEdit(user, "dispatch")
    || canEdit(user, "trainings")
    || canEdit(user, "maintenance");
  if (!ok) throw new Error("אין הרשאה");
  return user;
}

/** חיפוש חייל לפי מספר אישי — להקלדה מהירה במסך הרישום. */
export async function lookupSoldierByPn(personalNumber: string): Promise<
  { ok: true; id: string; fullName: string; company: string | null; squad: string | null; refresherDate: string | null }
  | { ok: false; error: string }
> {
  try {
    const user = await requireBulkTrainer();
    const pn = personalNumber.trim();
    if (!pn) return { ok: false, error: "הזן מספר אישי" };
    const s = await prisma.soldier.findFirst({
      where: { battalionId: user.battalionId!, personalNumber: pn, status: { notIn: ["DISCHARGED", "INACTIVE"] } },
      select: {
        id: true, fullName: true, drivingRefresherDate: true,
        company: { select: { name: true } }, squad: { select: { name: true } },
      },
    });
    if (!s) return { ok: false, error: `לא נמצא חייל פעיל עם מ.א ${pn}` };
    return {
      ok: true, id: s.id, fullName: s.fullName,
      company: s.company?.name ?? null, squad: s.squad?.name ?? null,
      refresherDate: s.drivingRefresherDate?.toISOString().slice(0, 10) ?? null,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/**
 * רישום מרוכז: מסמן לרשימת חיילים שביצעו הדרכה בתאריך נתון.
 * courseTypeId = "__driving_refresh__" → ריענון נהיגה בלבד.
 * אחרת → מופע קורס בתאריך + שיבוצים COMPLETED, כולל הענקת ההסמכות שהקורס מקנה.
 */
export async function bulkMarkTraining(payload: {
  courseTypeId: string; date: string; soldierIds: string[]; note?: string;
}): Promise<{ ok?: boolean; marked?: number; skipped?: number; error?: string }> {
  try {
    const user = await requireBulkTrainer();
    const bId = user.battalionId!;
    const { courseTypeId, date, soldierIds, note } = payload;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "תאריך לא תקין" };
    if (soldierIds.length === 0) return { error: "לא נבחרו חיילים" };

    // 🔒 IDOR: רק חיילים פעילים מהגדוד
    const valid = (await prisma.soldier.findMany({
      where: { id: { in: soldierIds }, battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] } },
      select: { id: true },
    })).map((s) => s.id);
    if (valid.length === 0) return { error: "לא נמצאו חיילים תקינים" };
    const skipped = soldierIds.length - valid.length;
    const when = new Date(date + "T00:00:00Z");

    if (courseTypeId === DRIVING_REFRESH) {
      await prisma.soldier.updateMany({ where: { id: { in: valid } }, data: { drivingRefresherDate: when } });
      await audit(user.id, "BULK_DRIVING_REFRESH", "Battalion", bId, { count: valid.length, date });
      revalidatePath("/driving-licenses"); revalidatePath("/soldiers"); revalidatePath("/dispatch");
      return { ok: true, marked: valid.length, skipped };
    }

    // הדרכה כללית — דרך מנגנון הקורסים הקיים
    const ct = await prisma.courseType.findFirst({
      where: { id: courseTypeId, battalionId: bId },
      include: { quals: true },
    });
    if (!ct) return { error: "סוג הדרכה לא נמצא" };

    const grants = ct.quals.filter((q) => q.role === "GRANT");
    await prisma.$transaction(async (tx) => {
      // מופע אחד ליום — כך שרישומים חוזרים באותו יום מתאחדים
      let inst = await tx.courseInstance.findFirst({ where: { battalionId: bId, courseTypeId: ct.id, startDate: when } });
      if (!inst) {
        inst = await tx.courseInstance.create({
          data: { battalionId: bId, courseTypeId: ct.id, startDate: when, status: "DONE", createdById: user.id, notes: note?.trim() || "רישום מרוכז" },
        });
      }
      for (const sid of valid) {
        await tx.courseEnrollment.upsert({
          where: { courseInstanceId_soldierId: { courseInstanceId: inst.id, soldierId: sid } },
          update: { status: "COMPLETED", completedAt: when },
          create: { battalionId: bId, courseInstanceId: inst.id, soldierId: sid, status: "COMPLETED", completedAt: when, enrolledById: user.id },
        });
        for (const g of grants) {
          if (g.certificationTypeId) {
            await tx.soldierCertification.upsert({
              where: { soldierId_certificationTypeId: { soldierId: sid, certificationTypeId: g.certificationTypeId } },
              update: {}, create: { soldierId: sid, certificationTypeId: g.certificationTypeId },
            });
          }
          if (g.drivingLicenseTypeId) {
            await tx.soldierDrivingLicense.upsert({
              where: { soldierId_licenseTypeId: { soldierId: sid, licenseTypeId: g.drivingLicenseTypeId } },
              update: {}, create: { soldierId: sid, licenseTypeId: g.drivingLicenseTypeId },
            });
            await tx.soldier.update({ where: { id: sid }, data: { drivingRefresherDate: when } });
          }
        }
      }
    });

    await audit(user.id, "BULK_TRAINING", "CourseType", ct.id, { count: valid.length, date, name: ct.name });
    revalidatePath("/driving-licenses"); revalidatePath("/trainings"); revalidatePath("/soldiers"); revalidatePath("/certifications");
    return { ok: true, marked: valid.length, skipped };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}
