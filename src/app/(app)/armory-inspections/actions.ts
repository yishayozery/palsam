"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { signLink } from "@/lib/link-token";
import { ensureArmoryChecklist } from "@/lib/armoryInspection";

function canManage(user: Parameters<typeof can>[0] & { isAdmin?: boolean }): boolean {
  return !!user.isAdmin || can(user, "armory") || can(user, "signatures.manage");
}

/** ממיר תאריך+שעה שהוזנו בשעון ישראל ל-Date נכון ב-UTC (כולל שעון קיץ). */
function israelWallToUtc(date: string, time: string): Date {
  const [yy, mm, dd] = date.split("-").map(Number);
  const [hh, mi] = time.split(":").map(Number);
  const utcGuess = Date.UTC(yy, (mm || 1) - 1, dd || 1, hh || 0, mi || 0);
  const ilMs = new Date(new Date(utcGuess).toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })).getTime();
  const utcMs = new Date(new Date(utcGuess).toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(utcGuess - (ilMs - utcMs));
}

/** עריכת סבב מתוכנן (מועד/בודק/ארמון) — רק לפני השלמה. */
export async function updateArmoryInspection(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  if (!canManage(user)) return { error: "אין הרשאה" };
  const id = String(formData.get("id") || "");
  const insp = await prisma.armoryInspection.findFirst({ where: { id, battalionId: user.battalionId! }, select: { status: true } });
  if (!insp) return { error: "סבב לא נמצא" };
  if (insp.status === "COMPLETED") return { error: "לא ניתן לערוך סבב שהושלם" };
  const date = String(formData.get("date") || "").trim();
  const time = String(formData.get("time") || "09:00").trim();
  const inspectorSoldierId = String(formData.get("inspectorSoldierId") || "").trim() || null;
  const inspectorName = String(formData.get("inspectorName") || "").trim() || null;
  const holderId = String(formData.get("holderId") || "").trim() || null;
  if (!date) return { error: "בחר תאריך" };
  if (!inspectorSoldierId && !inspectorName) return { error: "בחר מפקד בודק או הזן שם" };
  if (inspectorSoldierId && !(await prisma.soldier.findFirst({ where: { id: inspectorSoldierId, battalionId: user.battalionId! }, select: { id: true } }))) return { error: "מפקד לא נמצא" };
  await prisma.armoryInspection.update({ where: { id }, data: { scheduledAt: israelWallToUtc(date, time), inspectorSoldierId, inspectorName, holderId } });
  await audit(user.id, "UPDATE_ARMORY_INSPECTION", "ArmoryInspection", id, {});
  revalidatePath("/armory-inspections");
  return { ok: true };
}

/** תזמון סבב בדיקה חדש — snapshot של הסעיפים הפעילים + התראת טלגרם למפקד הבודק. */
export async function createArmoryInspection(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  if (!canManage(user)) return { error: "אין הרשאה" };
  const bId = user.battalionId!;

  const date = String(formData.get("date") || "").trim();
  const time = String(formData.get("time") || "09:00").trim();
  const inspectorSoldierId = String(formData.get("inspectorSoldierId") || "").trim() || null;
  const inspectorName = String(formData.get("inspectorName") || "").trim() || null;
  const holderId = String(formData.get("holderId") || "").trim() || null;
  if (!date) return { error: "בחר תאריך" };
  if (!inspectorSoldierId && !inspectorName) return { error: "בחר מפקד בודק או הזן שם" };

  // אימות בעלות של המפקד/מחסן לגדוד
  if (inspectorSoldierId) {
    const s = await prisma.soldier.findFirst({ where: { id: inspectorSoldierId, battalionId: bId }, select: { id: true } });
    if (!s) return { error: "מפקד לא נמצא" };
  }
  if (holderId) {
    const h = await prisma.holder.findFirst({ where: { id: holderId, battalionId: bId }, select: { id: true } });
    if (!h) return { error: "מחסן לא נמצא" };
  }

  await ensureArmoryChecklist(bId);
  const checklist = await prisma.armoryChecklistItem.findMany({ where: { battalionId: bId, active: true }, orderBy: { sortOrder: "asc" } });

  // המועד שהוזן הוא שעון ישראל — ממירים ל-UTC נכון (כולל שעון קיץ), אחרת השרת (UTC) מפרש שגוי.
  const [yy, mm, dd] = date.split("-").map(Number);
  const [hh, mi] = time.split(":").map(Number);
  const utcGuess = Date.UTC(yy, (mm || 1) - 1, dd || 1, hh || 0, mi || 0);
  const ilMs = new Date(new Date(utcGuess).toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })).getTime();
  const utcMs = new Date(new Date(utcGuess).toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  const scheduledAt = new Date(utcGuess - (ilMs - utcMs));
  const inspection = await prisma.armoryInspection.create({
    data: {
      battalionId: bId, holderId, scheduledAt, inspectorSoldierId, inspectorName, createdById: user.id,
      items: { create: checklist.map((c, i) => ({ label: c.label, sortOrder: i })) },
    },
  });

  await audit(user.id, "CREATE_ARMORY_INSPECTION", "ArmoryInspection", inspection.id, {});

  // התראת טלגרם למפקד הבודק (אם חייל עם טלגרם)
  if (inspectorSoldierId) {
    const soldier = await prisma.soldier.findUnique({ where: { id: inspectorSoldierId }, select: { fullName: true, telegramChatId: true } });
    const bat = await prisma.battalion.findUnique({ where: { id: bId }, select: { telegramBotToken: true, name: true } });
    if (soldier?.telegramChatId && bat?.telegramBotToken) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
      const link = `${baseUrl}/armory-inspection/${inspection.id}?t=${signLink("armory-inspection", inspection.id)}`;
      const when = scheduledAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      const { sendTelegramMessage } = await import("@/lib/telegram");
      await sendTelegramMessage(bat.telegramBotToken, soldier.telegramChatId,
        `🔫 <b>סבב בדיקת נשקייה — ${bat.name}</b>\n\nהוקצתה לך בדיקת נשקייה למועד <b>${when}</b>.\n\n👉 <a href="${link}">פתח את טופס הבדיקה</a> (בלי התחברות)`,
      ).catch(() => {});
    }
  }
  revalidatePath("/armory-inspections");
  return { ok: true };
}

export async function deleteArmoryInspection(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!canManage(user)) return;
  const id = String(formData.get("id") || "");
  const insp = await prisma.armoryInspection.findFirst({ where: { id, battalionId: user.battalionId! }, select: { id: true } });
  if (!insp) return;
  await prisma.armoryInspection.delete({ where: { id } });
  await audit(user.id, "DELETE_ARMORY_INSPECTION", "ArmoryInspection", id, {});
  revalidatePath("/armory-inspections");
}

/** הגדרות — סעיפי צ'קליסט */
export async function addArmoryChecklistItem(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!canManage(user)) return;
  const bId = user.battalionId!;
  const label = String(formData.get("label") || "").trim();
  if (!label) return;
  const max = await prisma.armoryChecklistItem.aggregate({ where: { battalionId: bId }, _max: { sortOrder: true } });
  await prisma.armoryChecklistItem.create({ data: { battalionId: bId, label, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
  revalidatePath("/armory-inspections");
}

export async function toggleArmoryChecklistItem(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!canManage(user)) return;
  const id = String(formData.get("id") || "");
  const item = await prisma.armoryChecklistItem.findFirst({ where: { id, battalionId: user.battalionId! }, select: { active: true } });
  if (!item) return;
  await prisma.armoryChecklistItem.update({ where: { id }, data: { active: !item.active } });
  revalidatePath("/armory-inspections");
}
