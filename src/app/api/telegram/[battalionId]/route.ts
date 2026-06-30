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
      select: {
        id: true,
        name: true,
        telegramBotToken: true,
        telegramBotInfo: true,
        armoryTestUrl: true,
        drivingRefreshDays: true,
      },
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

    // /start — registration
    if (text === "/start") {
      await sendTelegramMessage(
        token,
        chatId,
        `שלום! 👋\nאני הבוט של <b>${battalion.name}</b> במערכת PALMY.\n\nשלח/י את <b>המספר האישי</b> שלך כדי להתחבר.`,
      );
      return NextResponse.json({ ok: true });
    }

    // /help
    if (text === "/help") {
      await sendTelegramMessage(token, chatId, HELP_TEXT);
      return NextResponse.json({ ok: true });
    }

    // Commands that require a linked soldier
    const soldier = await prisma.soldier.findFirst({
      where: { battalionId, telegramChatId: chatId },
      select: {
        id: true,
        fullName: true,
        personalNumber: true,
        status: true,
        weaponsApprovedAt: true,
        armoryTestProofAt: true,
        weaponsAgreementSignedAt: true,
        drivingRefresherDate: true,
        company: { select: { name: true } },
      },
    });

    if (text === "/status") {
      if (!soldier) {
        await sendTelegramMessage(token, chatId, NOT_REGISTERED);
        return NextResponse.json({ ok: true });
      }
      await handleStatus(token, chatId, soldier, battalion);
      return NextResponse.json({ ok: true });
    }

    if (text === "/equipment") {
      if (!soldier) {
        await sendTelegramMessage(token, chatId, NOT_REGISTERED);
        return NextResponse.json({ ok: true });
      }
      await handleEquipment(token, chatId, soldier);
      return NextResponse.json({ ok: true });
    }

    if (text === "/info") {
      const info = battalion.telegramBotInfo;
      if (!info) {
        await sendTelegramMessage(token, chatId, "ℹ️ לא הוגדר מידע כללי עדיין.\nפנה למפקד שיעדכן בהגדרות המערכת.");
      } else {
        await sendTelegramMessage(token, chatId, `ℹ️ <b>מידע כללי — ${battalion.name}</b>\n\n${info}`);
      }
      return NextResponse.json({ ok: true });
    }

    // Not a command — try personal number registration
    const personalNumber = text.replace(/\D/g, "");
    if (!personalNumber || personalNumber.length < 5) {
      // Unknown text — show help
      await sendTelegramMessage(token, chatId, `לא הבנתי. ${HELP_TEXT}`);
      return NextResponse.json({ ok: true });
    }

    // Registration by personal number
    const target = await prisma.soldier.findFirst({
      where: { battalionId, personalNumber },
      select: { id: true, fullName: true, telegramChatId: true },
    });

    if (!target) {
      await sendTelegramMessage(
        token,
        chatId,
        `מספר אישי ${personalNumber} לא נמצא במערכת.\nוודא/י שהמספר נכון ונסה שוב.`,
      );
      return NextResponse.json({ ok: true });
    }

    if (target.telegramChatId === chatId) {
      await sendTelegramMessage(
        token,
        chatId,
        `כבר מחובר/ת, ${target.fullName}! ✅\nשלח /help לרשימת פקודות.`,
      );
      return NextResponse.json({ ok: true });
    }

    await prisma.soldier.update({
      where: { id: target.id },
      data: { telegramChatId: chatId },
    });

    await sendTelegramMessage(
      token,
      chatId,
      `מעולה, ${target.fullName}! ✅\nהתחברת בהצלחה למערכת PALMY.\n\nשלח /help לרשימת פקודות.`,
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[Telegram webhook error]", e);
    return NextResponse.json({ ok: true });
  }
}

const HELP_TEXT = `📋 <b>פקודות זמינות:</b>

/status — סטטוס חתימה ומבחנים
/equipment — רשימת ציוד חתום עליך
/info — מידע כללי (ארוחות, תפילות)
/help — הודעה זו`;

const NOT_REGISTERED = "⚠️ לא מחובר למערכת.\nשלח/י את המספר האישי כדי להתחבר.";

type SoldierCtx = {
  id: string;
  fullName: string;
  personalNumber: string | null;
  status: string;
  weaponsApprovedAt: Date | null;
  armoryTestProofAt: Date | null;
  weaponsAgreementSignedAt: Date | null;
  drivingRefresherDate: Date | null;
  company: { name: string } | null;
};

type BattalionCtx = {
  armoryTestUrl: string | null;
  drivingRefreshDays: number;
};

async function handleStatus(token: string, chatId: string, soldier: SoldierCtx, battalion: BattalionCtx) {
  const lines: string[] = [];
  lines.push(`📊 <b>סטטוס — ${soldier.fullName}</b>`);
  if (soldier.company) lines.push(`📍 ${soldier.company.name}`);
  lines.push("");

  // Weapon signing status
  lines.push("<b>🔫 תהליך חתימת נשק:</b>");

  const step1 = soldier.weaponsApprovedAt;
  lines.push(`${step1 ? "✅" : "⬜"} אישור מג״ד/סמג״ד${step1 ? ` (${fmtDate(step1)})` : ""}`);

  const step2 = soldier.armoryTestProofAt;
  lines.push(`${step2 ? "✅" : "⬜"} מבחן נוהל ארמון${step2 ? ` (${fmtDate(step2)})` : ""}`);
  if (!step2 && battalion.armoryTestUrl) {
    lines.push(`   👉 <a href="${battalion.armoryTestUrl}">לחץ כאן למבחן</a>`);
  }

  const step3 = soldier.weaponsAgreementSignedAt;
  lines.push(`${step3 ? "✅" : "⬜"} חתימה על נוהל שמירת נשק${step3 ? ` (${fmtDate(step3)})` : ""}`);

  const allDone = step1 && step2 && step3;
  lines.push("");
  lines.push(allDone ? "✅ <b>כל השלבים הושלמו — ניתן לחתום על נשק</b>" : "⏳ <b>יש שלבים שלא הושלמו</b>");

  // Signed serial items count
  const signedCount = await prisma.serialUnit.count({
    where: { signedSoldierId: soldier.id },
  });
  lines.push("");
  lines.push(`📦 פריטים חתומים: <b>${signedCount}</b>`);
  if (signedCount > 0) lines.push("שלח /equipment לרשימה מלאה");

  // Driving refresher
  if (soldier.drivingRefresherDate) {
    const refreshDays = battalion.drivingRefreshDays;
    const expiresAt = new Date(soldier.drivingRefresherDate);
    expiresAt.setDate(expiresAt.getDate() + refreshDays);
    const now = new Date();
    const expired = expiresAt < now;
    lines.push("");
    lines.push(`🚗 ריענון נהיגה: ${expired ? "❌ פג תוקף" : "✅ בתוקף"} (עד ${fmtDate(expiresAt)})`);
  }

  await sendTelegramMessage(token, chatId, lines.join("\n"));
}

async function handleEquipment(token: string, chatId: string, soldier: SoldierCtx) {
  const items = await prisma.serialUnit.findMany({
    where: { signedSoldierId: soldier.id },
    select: {
      serialNumber: true,
      itemType: { select: { name: true } },
    },
    orderBy: { itemType: { name: "asc" } },
  });

  if (items.length === 0) {
    await sendTelegramMessage(token, chatId, `📦 <b>${soldier.fullName}</b> — אין ציוד חתום כרגע.`);
    return;
  }

  const lines: string[] = [];
  lines.push(`📦 <b>ציוד חתום — ${soldier.fullName}</b>`);
  lines.push("");

  for (const item of items) {
    lines.push(`• ${item.itemType.name} — <code>${item.serialNumber}</code>`);
  }

  lines.push("");
  lines.push(`סה״כ: <b>${items.length}</b> פריטים`);

  await sendTelegramMessage(token, chatId, lines.join("\n"));
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
}
