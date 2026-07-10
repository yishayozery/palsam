import { prisma } from "./prisma";
import { sendTelegramMessage } from "./telegram";

/**
 * תזכורות דיווח נוכחות (ביצוע):
 *  - בוקר (מ-07:00) — תזכורת פתיחה לכל המדווחים (מפ/רס"פ + מפקדי מחלקות).
 *  - חצי שעה לפני "שעת הגג" (attendanceDeadline) — תזכורת חוזרת רק למי שטרם דיווח את הסקופ שלו.
 * מדווחי הפלוגה: מפ/רס"פ (COMPANY_REP). אם למחלקה יש מפקד — הוא מדווח על המחלקה שלו,
 * ושאר החיילים (ללא מפקד מחלקה) נשארים באחריות המפ/רס"פ.
 *
 * עמידות לתדירות ה-cron: כל שליחה מוגנת ב-"נשלח היום" (attendanceInitialSentOn /
 * attendanceFollowupSentOn = תאריך ישראל YYYY-MM-DD). כך אין כפילות אם ה-endpoint נקרא
 * מספר פעמים ביום (cron חיצוני כל 30 דק'), וגם ריצה יומית בודדת (Vercel Hobby) עדיין
 * שולחת את תזכורת הבוקר בחלון הבוקר. התזכורת החוזרת דורשת קריאה בחלון שלפני-הגג.
 */

// חלון הבוקר לתזכורת הפתיחה. מתחיל ב-06:00 כדי לתפוס גם את ריצת ה-cron היומית של
// Vercel (04:05 UTC = 06:05 בחורף / 07:05 בקיץ IST), פעם ביום בזכות ה-guard.
const MORNING_START = 6 * 60;      // 06:00
const MORNING_END = 12 * 60;       // 12:00

type Reporter = {
  chatId: string;
  label: string;               // "פלוגה" או "פלוגה / מחלקה"
  kind: "company" | "squad";
  companyId: string;
  squadId: string | null;
};

async function reportersFor(battalionId: string): Promise<Reporter[]> {
  // 🗓️ נאמני כ"א בלבד — חיילים שסומנו isAttendanceReporter (מדווחים גם מהבית).
  //    היקף: אם משויכים למחלקה — המחלקה שלהם; אחרת — כל הפלוגה.
  const trustees = await prisma.soldier.findMany({
    where: { battalionId, isAttendanceReporter: true, dischargedAt: null, telegramChatId: { not: null } },
    select: { telegramChatId: true, companyId: true, squadId: true, company: { select: { name: true } }, squad: { select: { name: true, company: { select: { name: true } } } } },
  });
  const out: Reporter[] = [];
  for (const t of trustees) {
    const chatId = t.telegramChatId;
    if (!chatId) continue;
    if (t.squadId) out.push({ chatId, label: `${t.squad?.company?.name || "פלוגה"} / ${t.squad?.name || "מחלקה"}`, kind: "squad", companyId: t.companyId, squadId: t.squadId });
    else if (t.companyId) out.push({ chatId, label: t.company?.name || "הפלוגה", kind: "company", companyId: t.companyId, squadId: null });
  }
  return out;
}

/** תזכורת פתיחה (בוקר) — לכל המדווחים. מוגן ב-"נשלח היום" למניעת כפילות. */
export async function sendAttendanceInitial(todayYmd: string): Promise<number> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
  const battalions = await prisma.battalion.findMany({
    where: { attendanceReminderEnabled: true, telegramBotToken: { not: null }, NOT: { attendanceInitialSentOn: todayYmd } },
    select: { id: true, telegramBotToken: true, attendanceReminderText: true },
  });
  let sent = 0;
  for (const b of battalions) {
    const reporters = await reportersFor(b.id);
    // סימון "נשלח היום" מיד — מונע כפילות גם אם אין מדווחים
    await prisma.battalion.update({ where: { id: b.id }, data: { attendanceInitialSentOn: todayYmd } });
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

/**
 * תזכורת חוזרת — רק למי שטרם דיווח את הסקופ שלו.
 * נשלחת פעם אחת ביום, בחלון [שעת-גג פחות 30 דק' , שעת-גג). מוגן ב-"נשלח היום".
 */
export async function sendAttendanceFollowup(nowMin: number, today: Date, todayYmd: string): Promise<number> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
  const battalions = await prisma.battalion.findMany({
    where: {
      attendanceReminderEnabled: true, telegramBotToken: { not: null }, attendanceDeadline: { not: null },
      NOT: { attendanceFollowupSentOn: todayYmd },
    },
    select: { id: true, telegramBotToken: true, attendanceDeadline: true },
  });

  let sent = 0;
  for (const b of battalions) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(b.attendanceDeadline!.trim());
    if (!m) continue;
    const deadlineMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    const targetMin = deadlineMin - 30;
    // חלון: מ-30 דק' לפני הגג ועד הגג עצמו
    if (nowMin < targetMin || nowMin >= deadlineMin) continue;
    // סימון "נשלח היום" מיד — מונע כפילות בקריאות תכופות
    await prisma.battalion.update({ where: { id: b.id }, data: { attendanceFollowupSentOn: todayYmd } });

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

  // תזכורת בוקר: פעם ביום, בחלון הבוקר (06:00–12:00). ריצת cron יומית בודדת עדיין נתפסת.
  const inMorning = nowMin >= MORNING_START && nowMin < MORNING_END;
  const initial = inMorning ? await sendAttendanceInitial(ymd).catch(() => 0) : 0;
  const followup = await sendAttendanceFollowup(nowMin, today, ymd).catch(() => 0);
  return { initial, followup };
}
