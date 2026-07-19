import { prisma } from "./prisma";
import { sendTelegramMessage } from "./telegram";

// התראות טלגרם בזרימת דיווח התאונה. שקוף לכשל (לא שובר את הפעולה העסקית).
async function sendToChats(battalionId: string, chatIds: (string | null | undefined)[], text: string) {
  const bat = await prisma.battalion.findUnique({ where: { id: battalionId }, select: { telegramBotToken: true } });
  if (!bat?.telegramBotToken) return;
  const seen = new Set<string>();
  for (const c of chatIds) {
    if (c && !seen.has(c)) { seen.add(c); await sendTelegramMessage(bat.telegramBotToken, c, text).catch(() => {}); }
  }
}

const baseUrl = () => process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";

/** קצין רכב = WAREHOUSE_MANAGER על מחסן רכבים (כמו תזכורת הטיפולים). */
export async function notifyVehicleOfficersAccident(battalionId: string, reportId: string, summary: string) {
  const officers = await prisma.appUser.findMany({
    where: { battalionId, active: true, role: "WAREHOUSE_MANAGER", holder: { warehouseType: "VEHICLES" } },
    select: { soldier: { select: { telegramChatId: true } } },
  });
  const text = `🚧 <b>דיווח תאונה חדש ממתין לטיפולך</b>\n${summary}\n👉 <a href="${baseUrl()}/accidents/${reportId}">פתח דיווח</a>`;
  await sendToChats(battalionId, officers.map((o) => o.soldier?.telegramChatId), text);
}

/** מג"ד/סמג"ד/מפקד גדוד — לאישור. */
export async function notifyMagadAccident(battalionId: string, reportId: string, summary: string) {
  const cmds = await prisma.appUser.findMany({
    where: { battalionId, active: true, role: { in: ["MAGAD", "SAMAGAD", "BATTALION_ADMIN"] } },
    select: { soldier: { select: { telegramChatId: true } } },
  });
  const text = `🚧 <b>דיווח תאונה ממתין לאישורך (מג״ד)</b>\n${summary}\n👉 <a href="${baseUrl()}/accidents/${reportId}">פתח ואשר</a>`;
  await sendToChats(battalionId, cmds.map((o) => o.soldier?.telegramChatId), text);
}
