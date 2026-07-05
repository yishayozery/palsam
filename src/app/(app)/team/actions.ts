"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { hashPassword } from "@/lib/auth";
import { resolveUniqueUsername } from "@/lib/usernames";
import { sendTelegramMessage } from "@/lib/telegram";
import { buildInviteText } from "@/lib/goliveTasks";
import { audit } from "@/lib/audit";

const DEFAULT_DELEGATE_CAP = 2; // תקרת ברירת מחדל למינוי רספ"ים/סגנים (ראה גם team/page.tsx)
const SQUAD_ROLE_NAME = "מפקד מחלקה";

/** האם המשתמש רשאי לנהל את ה-Holder (מנהל ישיר, או מנהל מערכת). */
function canManageHolder(user: { holderIds: string[]; isAdmin: boolean; isSuperAdmin: boolean }, holderId: string) {
  return user.isAdmin || user.isSuperAdmin || user.holderIds.includes(holderId);
}

/**
 * ממנה משתמש-משנה ל-Holder שהמשתמש מנהל:
 * - פלוגה + apptType=rep → רס"פ (COMPANY_REP), תקרה delegateCap ?? 2
 * - פלוגה + apptType=squad → מפקד מחלקה (systemRole), מחלקה אחת = מפקד אחד
 * - מחסן → סגן (אותו תפקיד/הרשאות כמו מנהל המחסן)
 * scoped, capped, + הזמנה בטלגרם אם החייל מחובר לבוט.
 */
export async function appointSubUser(formData: FormData) {
  const user = await requireUser();
  const bId = user.battalionId;
  if (!bId) throw new Error("אין גדוד");
  const holderId = String(formData.get("holderId") || "");
  if (!holderId || !canManageHolder(user, holderId)) throw new Error("אין לך הרשאה למנות ליחידה זו");

  const holder = await prisma.holder.findUnique({
    where: { id: holderId },
    select: { id: true, kind: true, name: true, delegateCap: true, battalionId: true },
  });
  if (!holder || holder.battalionId !== bId) throw new Error("יחידה לא נמצאה");

  const isWarehouse = holder.kind === "WAREHOUSE";
  const apptType = isWarehouse ? "deputy" : String(formData.get("apptType") || "rep");
  const squadId = String(formData.get("squadId") || "").trim() || null;

  // פרטים — עדיפות לחייל מהרשימה (מקור אמת לשם/נייד/טלגרם)
  let fullName = String(formData.get("fullName") || "").trim();
  let phone: string | null = String(formData.get("phone") || "").trim() || null;
  const enteredUsername = String(formData.get("username") || "").trim();
  const rawSoldierId = String(formData.get("soldierId") || "").trim() || null;
  let soldierId: string | null = null;
  let telegramChatId: string | null = null;
  if (rawSoldierId) {
    const soldier = await prisma.soldier.findUnique({
      where: { id: rawSoldierId },
      select: { id: true, battalionId: true, fullName: true, phone: true, telegramChatId: true },
    });
    if (soldier && soldier.battalionId === bId) {
      const linked = await prisma.appUser.findUnique({ where: { soldierId: rawSoldierId }, select: { username: true } });
      if (linked) throw new Error(`החייל כבר מקושר למשתמש @${linked.username}`);
      soldierId = soldier.id;
      fullName = soldier.fullName;
      phone = soldier.phone ?? phone;
      telegramChatId = soldier.telegramChatId;
    }
  }
  if (!fullName || !enteredUsername) throw new Error("חסר שם או שם משתמש");

  // ===== קביעת תפקיד + אכיפת תקרה לפי סוג המינוי =====
  let roleData: { role: "COMPANY_REP" | "WAREHOUSE_MANAGER"; systemRoleId: string | null; customRoleId: string | null };
  let inviteRole: "rep" | null = null;

  if (apptType === "squad") {
    // מפקד מחלקה — דורש מחלקה תקינה של הפלוגה, ומפקד אחד פעיל למחלקה
    if (!squadId) throw new Error("יש לבחור מחלקה");
    const squad = await prisma.squad.findUnique({ where: { id: squadId }, select: { companyId: true, battalionId: true, name: true } });
    if (!squad || squad.companyId !== holderId || squad.battalionId !== bId) throw new Error("מחלקה לא נמצאה בפלוגה זו");
    const existing = await prisma.userSquad.findFirst({
      where: { squadId, user: { active: true } },
      select: { user: { select: { fullName: true } } },
    });
    if (existing) throw new Error(`למחלקה ${squad.name} כבר יש מפקד פעיל (${existing.user.fullName}). הסר קודם.`);
    const role = await prisma.systemRole.findUnique({ where: { battalionId_name: { battalionId: bId, name: SQUAD_ROLE_NAME } }, select: { id: true } });
    roleData = { role: "COMPANY_REP", systemRoleId: role?.id ?? null, customRoleId: null };
  } else if (isWarehouse) {
    // סגן מחסן — אותו תפקיד כמו מנהל המחסן (הרשאות זהות)
    const cap = holder.delegateCap ?? DEFAULT_DELEGATE_CAP;
    const current = await prisma.appUser.count({ where: { holderId, active: true, id: { not: user.id } } });
    if (current >= cap) throw new Error(`הגעת לתקרה (${cap}). הסר קיים, או בקש ממנהל המערכת להגדיל.`);
    // מקור התפקיד: אם הממנה מנהל את המחסן — התפקיד שלו. אחרת (מנהל מערכת) — תפקיד מנהל קיים, אחרת WAREHOUSE_MANAGER.
    let src = user.holderIds.includes(holderId)
      ? await prisma.appUser.findUnique({ where: { id: user.id }, select: { role: true, systemRoleId: true, customRoleId: true } })
      : null;
    if (!src) src = await prisma.appUser.findFirst({ where: { holderId, active: true }, select: { role: true, systemRoleId: true, customRoleId: true } });
    roleData = {
      role: (src?.role as "WAREHOUSE_MANAGER") ?? "WAREHOUSE_MANAGER",
      systemRoleId: src?.systemRoleId ?? null,
      customRoleId: src?.customRoleId ?? null,
    };
  } else {
    // רס"פ פלוגתי
    const cap = holder.delegateCap ?? DEFAULT_DELEGATE_CAP;
    const current = await prisma.appUser.count({ where: { holderId, active: true, role: "COMPANY_REP", systemRoleId: null, id: { not: user.id } } });
    if (current >= cap) throw new Error(`הגעת לתקרה (${cap}). הסר קיים, או בקש ממנהל המערכת להגדיל.`);
    roleData = { role: "COMPANY_REP", systemRoleId: null, customRoleId: null };
    inviteRole = "rep";
  }

  const battalion = await prisma.battalion.findUnique({ where: { id: bId }, select: { brigade: true, code: true, telegramBotToken: true } });
  const holderSlug = holder.name.replace(/[^֐-׿a-zA-Z0-9]+/g, "").toLowerCase().slice(0, 12) || "unit";
  const suffix = [holderSlug, battalion?.brigade || battalion?.code || ""].filter(Boolean).join(".");
  const username = await resolveUniqueUsername(enteredUsername, suffix);
  const inviteToken = nanoid(28);

  const created = await prisma.appUser.create({
    data: {
      username, fullName, phone, battalionId: bId, holderId,
      role: roleData.role, systemRoleId: roleData.systemRoleId, customRoleId: roleData.customRoleId,
      ...(soldierId ? { soldierId } : {}),
      passwordHash: await hashPassword(nanoid(32)), passwordSet: false, inviteToken,
    },
  });
  if (apptType === "squad" && squadId) {
    await prisma.userSquad.create({ data: { userId: created.id, squadId } });
  }

  // הזמנה בטלגרם — אם החייל מחובר לבוט, שולחים לו את הלינק ישירות
  let notified = false;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  if (telegramChatId && battalion?.telegramBotToken && baseUrl) {
    const link = `${baseUrl}/invite/${inviteToken}`;
    const text = buildInviteText(link, inviteRole);
    try {
      await sendTelegramMessage(battalion.telegramBotToken, telegramChatId, text);
      notified = true;
    } catch { notified = false; }
  }

  await audit(user.id, "APPOINT_SUBUSER", "AppUser", username, { holderId, apptType, notified });
  revalidatePath("/team");
}

/** הסרת משתמש-משנה (השבתה — בטוח מול היסטוריה). scoped ליחידה שבניהול המשתמש. */
export async function removeSubUser(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") || "");
  if (id === user.id) throw new Error("אי אפשר להסיר את עצמך");
  const target = await prisma.appUser.findUnique({ where: { id }, select: { id: true, holderId: true, username: true } });
  if (!target || !target.holderId || !canManageHolder(user, target.holderId)) throw new Error("אין הרשאה");
  await prisma.appUser.update({ where: { id }, data: { active: false } });
  await audit(user.id, "REMOVE_SUBUSER", "AppUser", target.username, { holderId: target.holderId });
  revalidatePath("/team");
}

/** מנהל מערכת בלבד: שינוי תקרת האצלה ליחידה (null = ברירת מחדל 2). */
export async function setDelegateCap(formData: FormData) {
  const user = await requireUser();
  if (!user.isAdmin && !user.isSuperAdmin) throw new Error("רק מנהל מערכת יכול לשנות תקרה");
  const holderId = String(formData.get("holderId") || "");
  const capRaw = String(formData.get("cap") || "").trim();
  const cap = capRaw ? Math.max(0, Math.min(20, parseInt(capRaw, 10) || 0)) : null;
  const holder = await prisma.holder.findUnique({ where: { id: holderId }, select: { battalionId: true } });
  if (!holder || (!user.isSuperAdmin && holder.battalionId !== user.battalionId)) throw new Error("יחידה לא נמצאה");
  await prisma.holder.update({ where: { id: holderId }, data: { delegateCap: cap } });
  await audit(user.id, "SET_DELEGATE_CAP", "Holder", holderId, { cap });
  revalidatePath("/team");
}
