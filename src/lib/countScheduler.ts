import { prisma } from "./prisma";
import { sendTelegramMessage } from "./telegram";
import { runCountFromPlan } from "./count-runner";

// ===== אזור זמן ישראל — שעות הספירה מתפרשות לפי שעון ישראל, לא UTC של השרת =====
const TZ = "Asia/Jerusalem";
/** רכיבי שעון-קיר ישראלי (שנה/חודש/יום/יום-בשבוע) עבור רגע נתון. */
export function israelParts(date: Date): { y: number; m: number; d: number; dow: number } {
  const l = new Date(date.toLocaleString("en-US", { timeZone: TZ }));
  return { y: l.getFullYear(), m: l.getMonth(), d: l.getDate(), dow: l.getDay() };
}
function israelOffsetMs(date: Date): number {
  const utc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const il = new Date(date.toLocaleString("en-US", { timeZone: TZ }));
  return il.getTime() - utc.getTime();
}
/** ממיר שעון-קיר ישראלי (y,m,d,h,min) ל-Date ב-UTC — כולל שעון קיץ. */
function israelWallToDate(y: number, m: number, d: number, h: number, min: number): Date {
  const ts = Date.UTC(y, m, d, h, min);
  return new Date(ts - israelOffsetMs(new Date(ts)));
}
export const israelDayNum = (date: Date): number => { const p = israelParts(date); return p.y * 10000 + p.m * 100 + p.d; };

/** מחזיר את הזמן הבא (UTC) לפי המגדר — שעות לפי שעון ישראל. */
export function nextOccurrenceFor(
  plan: { scheduledTimes: string[]; daysOfWeek: number[]; frequencyDays: number },
  from: Date,
): Date | null {
  if (plan.scheduledTimes.length === 0) {
    if (plan.frequencyDays <= 0) return null;
    const next = new Date(from.getTime() + plan.frequencyDays * 86400000);
    const p = israelParts(next);
    return israelWallToDate(p.y, p.m, p.d, 8, 0);
  }
  for (let offset = 0; offset < 14; offset++) {
    const p = israelParts(new Date(from.getTime() + offset * 86400000));
    if (plan.daysOfWeek.length > 0 && !plan.daysOfWeek.includes(p.dow)) continue;
    for (const tm of plan.scheduledTimes) {
      const [h, mi] = tm.split(":").map((n) => parseInt(n, 10));
      if (isNaN(h) || isNaN(mi)) continue;
      const candidate = israelWallToDate(p.y, p.m, p.d, h, mi);
      if (candidate > from) return candidate;
    }
  }
  return null;
}

/** המשתמש האחראי האוטומטי על holder (קצין מחסן ראשי / רס"פ ראשי). */
async function pickAssignee(holderId: string): Promise<string | null> {
  const holder = await prisma.holder.findUnique({
    where: { id: holderId },
    include: {
      users: { where: { active: true }, orderBy: { createdAt: "asc" }, take: 1 },
    },
  });
  return holder?.users[0]?.id ?? null;
}

/** מחזיר את ה-holders הרלוונטיים לתכנית. אם scopeHolderIds ריק — כל המחסנים+הפלוגות הפעילים. */
async function holdersForPlan(plan: { battalionId: string; scopeHolderIds: string[] }): Promise<string[]> {
  if (plan.scopeHolderIds.length > 0) return plan.scopeHolderIds;
  const all = await prisma.holder.findMany({
    where: { battalionId: plan.battalionId, active: true, kind: { in: ["WAREHOUSE", "COMPANY"] } },
    select: { id: true },
  });
  return all.map((h) => h.id);
}

/**
 * יוצר משימות שטרם נוצרו לתכניות הפעילות. רעיון: לכל תכנית פעילה,
 * חשב את הזמן הבא שיש "להוליד" משימה — אם הוא בעבר/הווה ולא קיים — צור.
 * רץ מ-cron אחת לכמה דקות וגם בכל כניסה ל-/counts (best-effort).
 */
export async function generatePendingTasks(now: Date = new Date()): Promise<number> {
  const plans = await prisma.countPlan.findMany({ where: { active: true } });
  let created = 0;
  for (const plan of plans) {
    // טווח תאריכים: דלג אם עתידי או הסתיים
    if (plan.startDate && now < plan.startDate) continue;
    if (plan.endDate) {
      const endOfDay = new Date(plan.endDate);
      endOfDay.setHours(23, 59, 59, 999);
      if (now > endOfDay) continue;
    }

    // הזמן האחרון שכבר ייצרנו אליו משימה
    const latest = await prisma.countTask.findFirst({
      where: { planId: plan.id },
      orderBy: { scheduledAt: "desc" },
    });
    const earliestStart = plan.startDate ?? new Date(now.getTime() - plan.frequencyDays * 24 * 60 * 60 * 1000);
    const startFrom = latest?.scheduledAt ?? earliestStart;
    const nextTime = nextOccurrenceFor(plan, startFrom);
    // הקרון רץ פעם ביום (04:00 UTC) — יוצרים אם מועד הספירה חל היום (ישראל) או בעבר,
    // גם אם השעה מאוחרת מהקרון (אחרת התכנית "נופלת" ליום הבא).
    if (!nextTime || israelDayNum(nextTime) > israelDayNum(now)) continue;
    if (plan.endDate) {
      const endOfDayForNext = new Date(plan.endDate);
      endOfDayForNext.setHours(23, 59, 59, 999);
      if (nextTime > endOfDayForNext) continue;
    }

    // DEDUP: runCountFromPlan קובע scheduledAt=now, לכן dedup לפי nextTime לא עובד.
    // מוודאים ריצה אחת לכל היותר לתכנית ליום ישראלי אחד.
    const existing = await prisma.countTask.findMany({
      where: { planId: plan.id },
      select: { scheduledAt: true },
    });
    if (existing.some((t) => israelDayNum(t.scheduledAt) === israelDayNum(now))) continue;

    // "אחראי ספירה" (responsibleUserId) קובע מי מקבל את המשימה; אם לא הוגדר — המשתמש הראשון על ההולדר הראשון
    const assigneeId = plan.responsibleUserId ?? (await pickAssignee(plan.scopeHolderIds[0] ?? "")) ?? null;
    if (!assigneeId) continue;

    // ריצה מלאה אחת לתכנית — מחסן + מפוזר (קסקדת אימות per-soldier + טלגרם)
    const sid = await runCountFromPlan(
      plan.battalionId, plan.id, plan.scopeHolderIds, assigneeId, false,
      plan.isBlind, plan.countScope,
      { scopeCategoryIds: plan.scopeCategoryIds, scopeItemTypeIds: plan.scopeItemTypeIds, trackingMethods: plan.trackingMethods },
      plan.graceMinutes,
      { signOnComplete: plan.signOnComplete, correctByReporter: plan.correctByReporter },
    );
    if (sid) created++;
  }
  // עדכון משימות OVERDUE + שליחת התראות
  const overdueTasks = await prisma.countTask.findMany({
    where: { status: { in: ["PENDING", "IN_PROGRESS"] }, dueAt: { lt: now } },
    include: {
      holder: { select: { name: true } },
      plan: { select: { name: true, responsibleUserId: true, responsibleUser: { select: { soldier: { select: { telegramChatId: true } } } } } },
      assignedUser: { select: { fullName: true, soldier: { select: { telegramChatId: true } } } },
    },
  });
  if (overdueTasks.length > 0) {
    await prisma.countTask.updateMany({
      where: { id: { in: overdueTasks.map((t) => t.id) } },
      data: { status: "OVERDUE" },
    });
    for (const t of overdueTasks) {
      await notifyOverdue(t.battalionId, t).catch(() => {});
    }
  }
  return created;
}

/** שליחת הודעת טלגרם לאחראי על משימת ספירה חדשה */
async function notifyTaskAssignee(
  battalionId: string,
  task: {
    id: string;
    shareToken: string;
    holder: { name: string };
    assignedUser: { fullName: string; soldier: { telegramChatId: string | null } | null } | null;
    scheduledAt: Date;
    dueAt: Date;
  },
) {
  const chatId = task.assignedUser?.soldier?.telegramChatId;
  if (!chatId) return;

  const battalion = await prisma.battalion.findUnique({
    where: { id: battalionId },
    select: { telegramBotToken: true, name: true },
  });
  if (!battalion?.telegramBotToken) return;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
  const due = task.dueAt.toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const text = [
    `📋 <b>משימת ספירת מלאי חדשה</b>`,
    ``,
    `מחזיק: <b>${task.holder.name}</b>`,
    `עד: ${due}`,
    ``,
    `👉 <a href="${baseUrl}/counts/share/${task.shareToken}">לחץ כאן לביצוע הספירה</a>`,
  ].join("\n");

  await sendTelegramMessage(battalion.telegramBotToken, chatId, text);
}

/** שליחת התראת OVERDUE לאחראי על המשימה + לאחראי התכנית */
async function notifyOverdue(
  battalionId: string,
  task: {
    id: string;
    shareToken: string;
    holder: { name: string };
    plan: { name: string; responsibleUserId: string | null; responsibleUser: { soldier: { telegramChatId: string | null } | null } | null } | null;
    assignedUser: { fullName: string; soldier: { telegramChatId: string | null } | null } | null;
    dueAt: Date;
  },
) {
  const battalion = await prisma.battalion.findUnique({
    where: { id: battalionId },
    select: { telegramBotToken: true },
  });
  if (!battalion?.telegramBotToken) return;
  const token = battalion.telegramBotToken;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
  const due = task.dueAt.toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  // notify assignee
  const assigneeChatId = task.assignedUser?.soldier?.telegramChatId;
  if (assigneeChatId) {
    await sendTelegramMessage(token, assigneeChatId, [
      `⏰ <b>משימת ספירה באיחור!</b>`,
      ``,
      `מחזיק: <b>${task.holder.name}</b>`,
      `תכנית: ${task.plan?.name ?? "ספירה"}`,
      `מועד אחרון: ${due}`,
      ``,
      `👉 <a href="${baseUrl}/counts/share/${task.shareToken}">לחץ כאן לביצוע עכשיו</a>`,
    ].join("\n")).catch(() => {});
  }

  // notify plan responsible (if different from assignee)
  const responsibleChatId = task.plan?.responsibleUser?.soldier?.telegramChatId;
  if (responsibleChatId && responsibleChatId !== assigneeChatId) {
    await sendTelegramMessage(token, responsibleChatId, [
      `⚠️ <b>משימת ספירה באיחור</b>`,
      ``,
      `מחזיק: <b>${task.holder.name}</b>`,
      `אחראי: ${task.assignedUser?.fullName ?? "לא שויך"}`,
      `מועד אחרון: ${due}`,
      ``,
      `המשימה טרם בוצעה.`,
    ].join("\n")).catch(() => {});
  }
}
