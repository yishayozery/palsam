import { prisma } from "./prisma";
import { sendTelegramMessage } from "./telegram";

/**
 * תזכורת בוקר לדיווח נוכחות — נשלחת למדווחי הפלוגות (רס"פ עם טלגרם מקושר)
 * בגדודים שבהם התזכורת מופעלת. מופעל מה-cron היומי (בוקר).
 */
export async function sendAttendanceReminders(): Promise<number> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
  const battalions = await prisma.battalion.findMany({
    where: { attendanceReminderEnabled: true, telegramBotToken: { not: null } },
    select: { id: true, name: true, telegramBotToken: true, attendanceReminderText: true },
  });

  let sent = 0;
  for (const b of battalions) {
    const reporters = await prisma.appUser.findMany({
      where: {
        battalionId: b.id, active: true, role: "COMPANY_REP",
        soldier: { is: { telegramChatId: { not: null } } },
      },
      select: { fullName: true, holder: { select: { name: true } }, soldier: { select: { telegramChatId: true } } },
    });
    for (const r of reporters) {
      const chatId = r.soldier?.telegramChatId;
      if (!chatId) continue;
      const text = b.attendanceReminderText?.trim()
        ? `🗓️ <b>${b.attendanceReminderText.trim()}</b>\n\n👉 <a href="${baseUrl}/attendance">לחץ כאן לדיווח נוכחות</a>`
        : `🗓️ <b>בוקר טוב!</b>\nנא לדווח את נוכחות ${r.holder?.name || "הפלוגה"} להיום.\n\n👉 <a href="${baseUrl}/attendance">לחץ כאן לדיווח</a>`;
      try {
        await sendTelegramMessage(b.telegramBotToken!, chatId, text);
        sent++;
      } catch { /* non-fatal */ }
    }
  }
  return sent;
}
