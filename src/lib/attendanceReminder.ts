import { prisma } from "./prisma";
import { sendTelegramMessage } from "./telegram";

/**
 * תזכורות דיווח נוכחות (ביצוע):
 *  - 07:00 — תזכורת פתיחה לכל המדווחים (מפ/רס"פ + מפקדי מחלקות).
 *  - חצי שעה לפני "שעת הגג" (attendanceDeadline) — תזכורת חוזרת רק למי שטרם דיווח את הסקופ שלו.
 * מדווחי הפלוגה: מפ/רס"פ (COMPANY_REP). אם למחלקה יש מפקד — הוא מדווח על המחלקה שלו,
 * ושאר החיילים (ללא מפקד מחלקה) נשארים באחריות המפ/רס"פ.
 * מופעל מ-cron שרץ כל 30 דק' ומחשב שעה מקומית (Asia/Jerusalem).
 */

const INITIAL_MIN = 7 * 60; // 07:00
const slot = (min: number) => Math.floor(min / 30);

type Reporter = {
  chatId: string;
  label: string;               // "פלוגה" או "פלוגה / מחלקה"
  kind: "company" | "squad";
  companyId: string;
  squadId: string | null;
};

async function reportersFor(battalionId: string): Promise<Reporter[]> {
  const [reps, squadCmds] = await Promise.all([
    prisma.appUser.findMany({
      where: { battalionId, active: true, role: "COMPANY_REP", soldier: { is: { telegramChatId: { not: null } } } },
      select: { holderId: true, holder: { select: { name: true } }, soldier: { select: { telegramChatId: true } } },
    }),
    prisma.userSquad.findMany({
      where: { squad: { battalionId }, user: { active: true, soldier: { is: { telegramChatId: { not: null } } } } },
      select: { squadId: true, squad: { select: { companyId: true, name: true, company: { select: { name: true } } } }, user: { select: { soldier: { select: { telegramChatId: true } } } } },
    }),
  ]);

  const out: Reporter[] = [];
  for (const r of reps) {
    if (r.holderId && r.soldier?.telegramChatId) {
      out.push({ chatId: r.soldier.telegramChatId, label: r.holder?.name || "הפלוגה", kind: "company", companyId: r.holderId, squadId: null });
    }
  }
  for (const c of squadCmds) {
    const chatId = c.user.soldier?.telegramChatId;
    if (chatId) {
      out.push({ chatId, label: `${c.squad.company?.name || "פלוגה"} / ${c.squad.name}`, kind: "squad", companyId: c.squad.companyId, squadId: c.squadId });
    }
  }
  return out;
}

/** תזכורת פתיחה (07:00) — לכל המדווחים. */
export async function sendAttendanceInitial(): Promise<number> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
  const battalions = await prisma.battalion.findMany({
    where: { attendanceReminderEnabled: true, telegramBotToken: { not: null } },
    select: { id: true, telegramBotToken: true, attendanceReminderText: true },
  });
  let sent = 0;
  for (const b of battalions) {
    const reporters = await reportersFor(b.id);
    for (const rep of reporters) {
      const scope = rep.kind === "squad" ? rep.label : (rep.label !== "הפלוגה" ? rep.label : "הפלוגה");
      const text = b.attendanceReminderText?.trim()
        ? `🗓️ <b>${b.attendanceReminderText.trim()}</b>\n\n👉 <a href="${baseUrl}/attendance">לחץ כאן לדיווח נוכחות</a>`
        : `🗓️ <b>בוקר טוב!</b>\nנא לדווח את נוכחות ${scope} להיום.\n\n👉 <a href="${baseUrl}/attendance">לחץ כאן לדיווח</a>`;
      try { await sendTelegramMessage(b.telegramBotToken!, rep.chatId, text); sent++; } catch { /* non-fatal */ }
    }
  }
  return sent;
}

/** תזכורת חוזרת — רק למי שטרם דיווח את הסקופ שלו. נקראת לכל גדוד שהזמן שלו = שעת-גג פחות 30 דק'. */
export async function sendAttendanceFollowup(nowMin: number, today: Date): Promise<number> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
  const battalions = await prisma.battalion.findMany({
    where: { attendanceReminderEnabled: true, telegramBotToken: { not: null }, attendanceDeadline: { not: null } },
    select: { id: true, telegramBotToken: true, attendanceDeadline: true },
  });

  let sent = 0;
  for (const b of battalions) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(b.attendanceDeadline!.trim());
    if (!m) continue;
    const deadlineMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    const targetMin = deadlineMin - 30;
    if (slot(nowMin) !== slot(targetMin)) continue;

    const reporters = await reportersFor(b.id);
    if (reporters.length === 0) continue;

    // חיילים פעילים + מי כבר דווח היום
    const [soldiers, reported] = await Promise.all([
      prisma.soldier.findMany({ where: { battalionId: b.id, status: { notIn: ["DISCHARGED", "INACTIVE"] } }, select: { id: true, companyId: true, squadId: true } }),
      prisma.attendanceRecord.findMany({ where: { date: today, soldier: { battalionId: b.id } }, select: { soldierId: true } }),
    ]);
    const reportedSet = new Set(reported.map((r) => r.soldierId));
    const commandedSquadIds = new Set(reporters.filter((r) => r.kind === "squad" && r.squadId).map((r) => r.squadId!));

    const deadlineLabel = b.attendanceDeadline!;
    for (const rep of reporters) {
      // סקופ המדווח
      const scope = rep.kind === "squad"
        ? soldiers.filter((s) => s.squadId === rep.squadId)
        : soldiers.filter((s) => s.companyId === rep.companyId && (!s.squadId || !commandedSquadIds.has(s.squadId)));
      const missing = scope.filter((s) => !reportedSet.has(s.id)).length;
      if (missing === 0) continue;
      const text = `⏰ <b>תזכורת דיווח נוכחות</b>\nטרם דווחה נוכחות ${rep.label} — נותרו <b>${missing}</b> חיילים.\nשעת גג לדיווח: <b>${deadlineLabel}</b>.\n\n👉 <a href="${baseUrl}/attendance">לחץ כאן לדיווח</a>`;
      try { await sendTelegramMessage(b.telegramBotToken!, rep.chatId, text); sent++; } catch { /* non-fatal */ }
    }
  }
  return sent;
}

/** נקודת כניסה מה-cron: מחשב שעה מקומית (Asia/Jerusalem) ומפעיל את התזכורת המתאימה. */
export async function processAttendanceReminders(): Promise<{ initial: number; followup: number }> {
  const now = new Date();
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const [h, mm] = hhmm.split(":").map(Number);
  const nowMin = h * 60 + mm;
  // תאריך היום בישראל, כ-Date של חצות UTC (להשוואה מול @db.Date)
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(now); // YYYY-MM-DD
  const today = new Date(`${ymd}T00:00:00.000Z`);

  const initial = slot(nowMin) === slot(INITIAL_MIN) ? await sendAttendanceInitial().catch(() => 0) : 0;
  const followup = await sendAttendanceFollowup(nowMin, today).catch(() => 0);
  return { initial, followup };
}
