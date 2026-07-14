"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability, requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { DIET_OPTIONS } from "@/lib/diet";

/** ניתוק קישור הטלגרם של חייל — מפקדים ישירים (company.manage) על הפלוגה שלהם, או שלישות/אדמין. */
export async function unlinkTelegram(soldierId: string) {
  const user = await requireUser();
  const isCmd = can(user, "company.manage");
  const isRoster = can(user, "soldiers.roster") || user.isAdmin;
  if (!isCmd && !isRoster) return { error: "אין הרשאה" };
  const bId = user.battalionId!;
  const s = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { battalionId: true, companyId: true } });
  if (!s || s.battalionId !== bId) return { error: "חייל לא נמצא" };
  // מפקד ללא הרשאת שלישות — רק על חיילי הפלוגה/מחלקות שלו
  if (!isRoster && user.holderId && s.companyId !== user.holderId) return { error: "מחוץ להרשאה שלך" };
  await prisma.soldier.update({ where: { id: soldierId }, data: { telegramChatId: null } });
  await audit(user.id, "UNLINK_TELEGRAM", "Soldier", soldierId);
  revalidatePath("/soldiers");
  return { ok: true };
}

export async function saveCompanyRole(formData: FormData) {
  const user = await requireCapability("company.manage");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const isCommander = formData.get("isCommander") === "on" || formData.get("isCommander") === "true";
  const sortOrder = parseInt(String(formData.get("sortOrder") || "0"), 10) || 0;
  const companyId = user.holderId || String(formData.get("companyId") || "");
  if (!name || !companyId) return;

  if (id) {
    const row = await prisma.companyRole.findUnique({ where: { id }, select: { battalionId: true } });
    if (!row || row.battalionId !== bId) return;
    await prisma.companyRole.update({ where: { id }, data: { name, isCommander, sortOrder } });
  } else {
    await prisma.companyRole.create({ data: { battalionId: bId, companyId, name, isCommander, sortOrder } });
  }
  await audit(user.id, id ? "UPDATE" : "CREATE", "CompanyRole", id || name, { companyId });
  revalidatePath("/soldiers");
}

export async function toggleCompanyRole(formData: FormData) {
  const user = await requireCapability("company.manage");
  const id = String(formData.get("id") || "");
  const r = await prisma.companyRole.findUnique({ where: { id } });
  if (!r || r.battalionId !== user.battalionId) return;
  await prisma.companyRole.update({ where: { id }, data: { active: !r.active } });
  await audit(user.id, "UPDATE", "CompanyRole", id, { active: !r.active });
  revalidatePath("/soldiers");
}

export async function saveSquad(formData: FormData) {
  const user = await requireCapability("company.manage");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const sortOrder = parseInt(String(formData.get("sortOrder") || "0"), 10) || 0;
  const companyId = user.holderId || String(formData.get("companyId") || "");
  if (!name || !companyId) return;

  if (id) {
    const row = await prisma.squad.findUnique({ where: { id }, select: { battalionId: true } });
    if (!row || row.battalionId !== bId) return;
    await prisma.squad.update({ where: { id }, data: { name, sortOrder } });
  } else {
    await prisma.squad.create({ data: { battalionId: bId, companyId, name, sortOrder } });
  }
  await audit(user.id, id ? "UPDATE" : "CREATE", "Squad", id || name);
  revalidatePath("/soldiers");
  revalidatePath("/attendance");
  revalidatePath("/attendance-settings");
}

export async function toggleSquad(formData: FormData) {
  const user = await requireCapability("company.manage");
  const id = String(formData.get("id") || "");
  const sq = await prisma.squad.findUnique({ where: { id } });
  if (!sq || sq.battalionId !== user.battalionId) return;
  await prisma.squad.update({ where: { id }, data: { active: !sq.active } });
  await audit(user.id, "UPDATE", "Squad", id, { active: !sq.active });
  revalidatePath("/soldiers");
  revalidatePath("/attendance");
  revalidatePath("/attendance-settings");
}

/** עדכון מהיר של סוג מזון/כשרות לחייל (עמודה במסך הפלוגה). */
export async function setSoldierDiet(soldierId: string, diet: string): Promise<{ ok?: boolean; error?: string }> {
  const user = await requireCapability("company.manage");
  const bId = user.battalionId!;
  const s = await prisma.soldier.findFirst({ where: { id: soldierId, battalionId: bId }, select: { id: true } });
  if (!s) return { error: "חייל לא נמצא" };
  const value = diet && diet !== "ללא" && (DIET_OPTIONS as readonly string[]).includes(diet) ? diet : null;
  await prisma.soldier.update({ where: { id: soldierId }, data: { dietType: value } });
  revalidatePath("/soldiers");
  return { ok: true };
}

export async function saveSoldier(formData: FormData): Promise<string | undefined> {
  const user = await requireCapability("company.manage");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const fullName = String(formData.get("fullName") || "").trim();
  const personalNumber = String(formData.get("personalNumber") || "").trim();
  const phone = String(formData.get("phone") || "").trim() || null;
  const platoon = String(formData.get("platoon") || "").trim() || null;
  const squadId = String(formData.get("squadId") || "").trim() || null;
  const companyRoleId = String(formData.get("companyRoleId") || "").trim() || null;
  const dutyRoundRaw = String(formData.get("dutyRound") || "").trim();
  const dutyRound = dutyRoundRaw ? (Math.min(3, Math.max(1, parseInt(dutyRoundRaw, 10) || 0)) || null) : null;
  const isAttendanceReporter = formData.get("isAttendanceReporter") === "on" || formData.get("isAttendanceReporter") === "true";
  const dietRaw = String(formData.get("dietType") || "").trim();
  const dietType = dietRaw && dietRaw !== "ללא" ? dietRaw : null; // "ללא" = ריק
  let companyId = String(formData.get("companyId") || "") || null;
  // 🛡️ פלוגת חייל חייבת להיות holder מסוג COMPANY — לעולם לא מחסן.
  // (מנע באג: מנהל מחסן שערך חייל בלי לבחור פלוגה — הפלוגה נדרסה לשם המחסן שלו.)
  if (companyId) {
    const h = await prisma.holder.findUnique({ where: { id: companyId }, select: { kind: true, battalionId: true } });
    if (!h || h.battalionId !== bId || h.kind !== "COMPANY") companyId = null;
  }
  if (!companyId && user.holderId) {
    const h = await prisma.holder.findUnique({ where: { id: user.holderId }, select: { kind: true } });
    if (h?.kind === "COMPANY") companyId = user.holderId; // ברירת מחדל רק אם ה-holder הראשי הוא פלוגה
  }
  if (id && !companyId) {
    const existing = await prisma.soldier.findUnique({ where: { id }, select: { companyId: true } });
    companyId = existing?.companyId ?? null; // בעריכה — שמור על הפלוגה הקיימת, אל תדרוס
  }
  if (!fullName || !personalNumber) return "שם ומספר אישי הם שדות חובה";

  if (!/^\d{7}$/.test(personalNumber)) return "מספר אישי חייב להיות 7 ספרות";

  const duplicate = await prisma.soldier.findFirst({
    where: { battalionId: bId, personalNumber, ...(id ? { id: { not: id } } : {}) },
  });
  if (duplicate) return `מספר אישי ${personalNumber} כבר קיים בגדוד (${duplicate.fullName})`;

  if (phone && !/^05\d{8}$/.test(phone.replace(/-/g, "")))
    return "מספר נייד לא תקין — נדרש פורמט 05X-XXXXXXX";

  const cleanPhone = phone ? phone.replace(/-/g, "") : null;

  const data = { fullName, personalNumber, phone: cleanPhone, platoon, companyId, squadId, companyRoleId, dutyRound, isAttendanceReporter,
    ...(formData.has("dietType") ? { dietType } : {}) };
  if (id) {
    const row = await prisma.soldier.findUnique({ where: { id }, select: { battalionId: true } });
    if (!row || row.battalionId !== bId) return "חייל לא נמצא";
    await prisma.soldier.update({ where: { id }, data });
  } else {
    await prisma.soldier.create({ data: { ...data, battalionId: bId } });
  }
  await audit(user.id, id ? "UPDATE" : "CREATE", "Soldier", id || personalNumber);
  revalidatePath("/soldiers");
}

export async function toggleSoldier(formData: FormData) {
  const user = await requireCapability("company.manage");
  const id = String(formData.get("id") || "");
  const s = await prisma.soldier.findUnique({ where: { id } });
  if (!s || s.battalionId !== user.battalionId) return;
  const newStatus = (s.status === "DISCHARGED" || s.status === "INACTIVE") ? "REGISTERED" : "INACTIVE";
  await prisma.soldier.update({ where: { id }, data: { status: newStatus } });
  await audit(user.id, "UPDATE", "Soldier", id, { status: newStatus });
  revalidatePath("/soldiers");
}

/**
 * בקשה לפתיחת שמ"פ — נשלחת בבוט לשלישות (בעלי הרשאת roster) לאישור.
 * הם מאשרים תאריך התחלה (ברירת מחדל: היום) דרך כפתור בבוט (callback openshmap).
 */
export async function requestOpenCallup(formData: FormData): Promise<{ ok?: boolean; error?: string; sent?: number }> {
  const user = await requireCapability("company.manage");
  const bId = user.battalionId!;
  const soldierId = String(formData.get("soldierId") || "");
  if (!soldierId) return { error: "חסר חייל" };
  const soldier = await prisma.soldier.findFirst({
    where: { id: soldierId, battalionId: bId },
    select: { id: true, fullName: true, personalNumber: true, company: { select: { name: true } } },
  });
  if (!soldier) return { error: "חייל לא נמצא" };
  const openCallup = await prisma.callupPeriod.findFirst({ where: { soldierId, endDate: null }, select: { id: true } });
  if (openCallup) return { error: "לחייל כבר יש שמ\"פ פתוח" };

  const battalion = await prisma.battalion.findUnique({ where: { id: bId }, select: { telegramBotToken: true } });
  if (!battalion?.telegramBotToken) return { error: "לגדוד אין בוט טלגרם מוגדר" };

  // שלישות = בעלי הרשאת עריכה למסך roster (+ שליש/אדמין legacy), מחוברים לבוט
  const rosterRoles = await prisma.systemRole.findMany({
    where: { battalionId: bId, permissions: { some: { screen: "roster", level: "EDIT" } } },
    select: { id: true },
  });
  const shalish = await prisma.appUser.findMany({
    where: {
      battalionId: bId, active: true, soldier: { is: { telegramChatId: { not: null } } },
      OR: [{ systemRoleId: { in: rosterRoles.map((r) => r.id) } }, { role: { in: ["SHALISH", "BATTALION_ADMIN"] } }],
    },
    select: { soldier: { select: { telegramChatId: true } } },
  });
  if (shalish.length === 0) return { error: "לא נמצאה שלישות מחוברת לבוט" };

  const { sendTelegramMessage } = await import("@/lib/telegram");
  const text = `🪖 <b>בקשה לפתיחת שמ"פ</b>\nחייל: <b>${soldier.fullName}</b>${soldier.personalNumber ? ` (${soldier.personalNumber})` : ""}${soldier.company?.name ? ` · ${soldier.company.name}` : ""}\nמבקש: ${user.fullName}\n\nבחר תאריך התחלה לפתיחת השמ"פ:`;
  const kb = { inline_keyboard: [[
    { text: "✅ מהיום", callback_data: `openshmap:${soldierId}:0` },
    { text: "אתמול", callback_data: `openshmap:${soldierId}:1` },
    { text: "שלשום", callback_data: `openshmap:${soldierId}:2` },
  ]] };
  let sent = 0;
  const seen = new Set<string>();
  for (const u of shalish) {
    const chatId = u.soldier?.telegramChatId;
    if (chatId && !seen.has(chatId)) { seen.add(chatId); try { await sendTelegramMessage(battalion.telegramBotToken, chatId, text, kb); sent++; } catch { /* non-fatal */ } }
  }
  await audit(user.id, "REQUEST_OPEN_CALLUP", "Soldier", soldierId, { sent });
  revalidatePath("/soldiers");
  return { ok: true, sent };
}
