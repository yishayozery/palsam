import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ battalionId: string }> },
) {
  try {
    const { battalionId } = await params;

    const battalion = await prisma.battalion.findUnique({
      where: { id: battalionId },
      select: { id: true, name: true, telegramBotToken: true },
    });
    if (!battalion?.telegramBotToken) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    const body = await req.json();
    const message = body?.message;
    if (!message?.chat?.id || !message?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = String(message.chat.id);
    const text = message.text.trim();
    const token = battalion.telegramBotToken;

    if (text === "/start") {
      await sendTelegramMessage(
        token,
        chatId,
        `שלום! 👋\nאני הבוט של <b>${battalion.name}</b> במערכת PALMY.\n\nשלח/י את <b>המספר האישי</b> שלך כדי להתחבר.`,
      );
      return NextResponse.json({ ok: true });
    }

    const personalNumber = text.replace(/\D/g, "");
    if (!personalNumber || personalNumber.length < 5) {
      await sendTelegramMessage(
        token,
        chatId,
        "לא הצלחתי לזהות מספר אישי. שלח/י מספר אישי (ספרות בלבד).",
      );
      return NextResponse.json({ ok: true });
    }

    const soldier = await prisma.soldier.findFirst({
      where: { battalionId, personalNumber },
      select: { id: true, fullName: true, telegramChatId: true },
    });

    if (!soldier) {
      await sendTelegramMessage(
        token,
        chatId,
        `מספר אישי ${personalNumber} לא נמצא במערכת.\nוודא/י שהמספר נכון ונסה שוב.`,
      );
      return NextResponse.json({ ok: true });
    }

    if (soldier.telegramChatId === chatId) {
      await sendTelegramMessage(
        token,
        chatId,
        `כבר מחובר/ת, ${soldier.fullName}! ✅\nתקבל/י הודעות אימות ציוד דרך כאן.`,
      );
      return NextResponse.json({ ok: true });
    }

    await prisma.soldier.update({
      where: { id: soldier.id },
      data: { telegramChatId: chatId },
    });

    await sendTelegramMessage(
      token,
      chatId,
      `מעולה, ${soldier.fullName}! ✅\nהתחברת בהצלחה למערכת PALMY.\nתקבל/י הודעות אימות ציוד דרך כאן.`,
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[Telegram webhook error]", e);
    return NextResponse.json({ ok: true });
  }
}
