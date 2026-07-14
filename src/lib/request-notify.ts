import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import type { RequestType } from "@/generated/prisma";

/** התראת טלגרם לאחראי-התחום של הגדוד המבקש (חיילים עם/בלי חשבון שקושרו לבוט) על שינוי בדרישה.
 *  best-effort — לא מפילה את הפעולה הקוראת. */
export async function notifyBattalionResponsibles(battalionId: string, type: RequestType, message: string): Promise<void> {
  try {
    const [battalion, resps] = await Promise.all([
      prisma.battalion.findUnique({ where: { id: battalionId }, select: { telegramBotToken: true } }),
      prisma.requestResponsible.findMany({ where: { battalionId, type, chatId: { not: null } }, select: { chatId: true } }),
    ]);
    const botToken = battalion?.telegramBotToken;
    if (!botToken || resps.length === 0) return;
    await Promise.all(resps.map((r) => sendTelegramMessage(botToken, r.chatId!, message).catch(() => {})));
  } catch { /* התראה בbest-effort */ }
}
