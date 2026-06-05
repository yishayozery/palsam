import { prisma } from "./prisma";

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
    // הזמן האחרון שכבר ייצרנו אליו משימה
    const latest = await prisma.countTask.findFirst({
      where: { planId: plan.id },
      orderBy: { scheduledAt: "desc" },
    });
    const startFrom = latest?.scheduledAt ?? new Date(now.getTime() - plan.frequencyDays * 24 * 60 * 60 * 1000);
    const nextTime = nextOccurrenceFor(plan, startFrom);
    if (!nextTime || nextTime > now) continue; // עתידי — לא ניצור עדיין

    const holderIds = await holdersForPlan(plan);
    const dueAt = new Date(nextTime.getTime() + plan.graceMinutes * 60 * 1000);
    for (const hId of holderIds) {
      const exists = await prisma.countTask.findFirst({
        where: { planId: plan.id, holderId: hId, scheduledAt: nextTime },
      });
      if (exists) continue;
      const assigneeId = await pickAssignee(hId);
      await prisma.countTask.create({
        data: {
          battalionId: plan.battalionId, planId: plan.id, holderId: hId,
          assignedUserId: assigneeId, scheduledAt: nextTime, dueAt,
          status: "PENDING",
        },
      });
      created++;
    }
  }
  // עדכון משימות OVERDUE
  await prisma.countTask.updateMany({
    where: { status: { in: ["PENDING", "IN_PROGRESS"] }, dueAt: { lt: now } },
    data: { status: "OVERDUE" },
  });
  return created;
}
