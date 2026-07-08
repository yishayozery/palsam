import { prisma } from "./prisma";
import { sendTelegramMessage } from "./telegram";

/** מחזיר את הזמן הבא לפי המגדר. אם השעות ריקות — לפי frequencyDays מהזמן הנוכחי. */
export function nextOccurrenceFor(
  plan: { scheduledTimes: string[]; daysOfWeek: number[]; frequencyDays: number },
  from: Date,
): Date | null {
  const base = new Date(from);
  // אם אין שעות מוגדרות — פשוט להוסיף frequencyDays
  if (plan.scheduledTimes.length === 0) {
    if (plan.frequencyDays <= 0) return null;
    const d = new Date(base);
    d.setDate(d.getDate() + plan.frequencyDays);
    d.setHours(8, 0, 0, 0);
    return d;
  }
  // עוברים על הימים הקרובים עד 14 ימים לפנים
  for (let offset = 0; offset < 14; offset++) {
    const day = new Date(base);
    day.setDate(day.getDate() + offset);
    const dow = day.getDay();
    if (plan.daysOfWeek.length > 0 && !plan.daysOfWeek.includes(dow)) continue;
    for (const tm of plan.scheduledTimes) {
      const [h, m] = tm.split(":").map((n) => parseInt(n, 10));
      if (isNaN(h) || isNaN(m)) continue;
      const candidate = new Date(day);
      candidate.setHours(h, m, 0, 0);
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
    if (!nextTime || nextTime > now) continue; // עתידי — לא ניצור עדיין
    if (plan.endDate) {
      const endOfDayForNext = new Date(plan.endDate);
      endOfDayForNext.setHours(23, 59, 59, 999);
      if (nextTime > endOfDayForNext) continue;
    }

    const holderIds = await holdersForPlan(plan);
    const dueAt = new Date(nextTime.getTime() + plan.graceMinutes * 60 * 1000);
    for (const hId of holderIds) {
      const exists = await prisma.countTask.findFirst({
        where: { planId: plan.id, holderId: hId, scheduledAt: nextTime },
      });
      if (exists) continue;
      // "אחראי ספירה" (responsibleUserId) קובע מי מקבל את המשימה בבוט; אם לא הוגדר — המשתמש הראשון על ההולדר
      const assigneeId = plan.responsibleUserId ?? await pickAssignee(hId);
      const newTask = await prisma.countTask.create({
        data: {
          battalionId: plan.battalionId, planId: plan.id, holderId: hId,
          assignedUserId: assigneeId, scheduledAt: nextTime, dueAt,
          status: "PENDING",
        },
        include: {
          holder: { select: { name: true } },
          assignedUser: { select: { fullName: true, soldier: { select: { telegramChatId: true } } } },
        },
      });
      created++;
      // שליחת התראת טלגרם לאחראי על המשימה
      await notifyTaskAssignee(plan.battalionId, newTask).catch(() => {});
    }
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
