import "server-only";
import { prisma } from "./prisma";
import { sendTelegramMessage } from "./telegram";

/**
 * דוח יומי לקצין הרכב על נהגים שרישיונם האזרחי פג / עומד לפוג בפחות מחודש.
 * נשלח **רק בתעסוקה** — גדוד עם Employment פעיל המכסה את היום.
 */
export async function processDriverLicenseReports(now: Date = new Date()): Promise<{ battalions: number; sent: number }> {
  const today = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z");
  const soon = new Date(now.getTime() + 30 * 86400000);

  // גדודים עם תעסוקה פעילה המכסה את היום
  const emps = await prisma.employment.findMany({
    where: { active: true, startDate: { lte: today }, endDate: { gte: today } },
    select: { battalionId: true }, distinct: ["battalionId"],
  });
  const battalionIds = [...new Set(emps.map((e) => e.battalionId))];
  if (battalionIds.length === 0) return { battalions: 0, sent: 0 };

  let sent = 0, handled = 0;
  for (const bId of battalionIds) {
    const battalion = await prisma.battalion.findUnique({ where: { id: bId }, select: { telegramBotToken: true, name: true } });
    if (!battalion?.telegramBotToken) continue;

    // נהגים שרישיונם פג / פג בפחות מחודש
    const drivers = await prisma.soldier.findMany({
      where: { battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] }, civilianLicenseExpiry: { not: null, lte: soon } },
      orderBy: { civilianLicenseExpiry: "asc" },
      select: { fullName: true, personalNumber: true, civilianLicenseExpiry: true, company: { select: { name: true } } },
    });
    if (drivers.length === 0) continue;

    // קציני רכב (WAREHOUSE_MANAGER) המחוברים לבוט
    const officers = await prisma.appUser.findMany({
      where: { battalionId: bId, active: true, role: "WAREHOUSE_MANAGER", soldier: { telegramChatId: { not: null } } },
      select: { soldier: { select: { telegramChatId: true } } },
    });
    if (officers.length === 0) continue;
    handled++;

    const lines = drivers.map((d) => {
      const exp = d.civilianLicenseExpiry!;
      const days = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
      const tag = days < 0 ? `❌ פג לפני ${Math.abs(days)} י׳` : days === 0 ? "⚠️ פג היום" : `⏳ בעוד ${days} י׳`;
      return `• ${d.fullName} (${d.personalNumber ?? "—"}) · ${d.company?.name ?? "—"} — ${exp.toISOString().slice(0, 10)} ${tag}`;
    });
    const text = [
      `🪪 <b>דוח רישיונות נהיגה — ${battalion.name}</b>`, ``,
      `${drivers.length} נהגים עם רישיון אזרחי שפג / פג בפחות מחודש:`, ``,
      ...lines, ``,
      `יש לחדש רישיון או להשבית מנהיגה.`,
    ].join("\n");

    const chatIds = [...new Set(officers.map((o) => o.soldier!.telegramChatId!))];
    const results = await Promise.allSettled(chatIds.map((c) => sendTelegramMessage(battalion.telegramBotToken!, c, text)));
    sent += results.filter((r) => r.status === "fulfilled").length;
  }
  return { battalions: handled, sent };
}
