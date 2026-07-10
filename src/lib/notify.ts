import "server-only";
import { prisma } from "./prisma";

/**
 * שליחת עותק/אישור בטלגרם למחתים (יוצר התעודה) — דרך החייל המקושר למשתמש.
 * לא מפיל שום פעולה אם נכשל. מחזיר true אם נשלח.
 */
export async function notifyIssuerTelegram(
  userId: string | null,
  battalionId: string,
  transferId: string | null,
  kind: "signout" | "signed",
): Promise<boolean> {
  try {
    if (!userId || !transferId) return false;
    const issuer = await prisma.appUser.findUnique({
      where: { id: userId },
      select: { soldier: { select: { telegramChatId: true } } },
    });
    const chatId = issuer?.soldier?.telegramChatId;
    if (!chatId) return false;
    const battalion = await prisma.battalion.findUnique({
      where: { id: battalionId },
      select: { telegramBotToken: true },
    });
    if (!battalion?.telegramBotToken) return false;
    const tr = await prisma.transfer.findUnique({
      where: { id: transferId },
      select: {
        toSoldier: { select: { fullName: true } },
        toHolder: { select: { name: true } },
        _count: { select: { lines: true } },
      },
    });
    const receiver = tr?.toSoldier?.fullName ?? tr?.toHolder?.name ?? "—";
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
    const head = kind === "signed" ? "✅ <b>התעודה נחתמה ע\"י המקבל</b>" : "📝 <b>בוצעה החתמת ציוד</b>";
    const { linkTokenQuery } = await import("@/lib/link-token");
    const text = `${head}\nמקבל: ${receiver}\nפריטים: ${tr?._count.lines ?? 0}\n\n📄 <a href="${baseUrl}/transfer-doc/${transferId}${linkTokenQuery("transfer-doc", transferId)}">צפייה בתעודה</a>`;
    const { sendTelegramMessage } = await import("@/lib/telegram");
    await sendTelegramMessage(battalion.telegramBotToken, chatId, text);
    return true;
  } catch (e) {
    console.error("[notifyIssuerTelegram] failed (non-fatal):", e);
    return false;
  }
}
