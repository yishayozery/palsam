import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage, answerCallbackQuery, editMessageText, MAIN_KEYBOARD } from "@/lib/telegram";

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
    // fallback: אם אין armoryTestUrl על הגדוד — נבדוק על מחסן ארמון
    if (battalion && !battalion.armoryTestUrl) {
      const armoryHolder = await prisma.holder.findFirst({
        where: { battalionId, warehouseType: "ARMORY", active: true, armoryTestUrl: { not: null } },
        select: { armoryTestUrl: true },
      });
      if (armoryHolder?.armoryTestUrl) battalion.armoryTestUrl = armoryHolder.armoryTestUrl;
    }
    if (!battalion?.telegramBotToken) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    const body = await req.json();
    const token = battalion.telegramBotToken;

    // --- Inline keyboard callback (verification responses) ---
    const callback = body?.callback_query;
    if (callback?.data && callback?.message?.chat?.id) {
      await handleCallback(token, callback, battalionId);
      return NextResponse.json({ ok: true });
    }

    const message = body?.message;
    if (!message?.chat?.id || !message?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = String(message.chat.id);
    const text = message.text.trim();

    // Map Hebrew keyboard buttons to commands
    const CMD_MAP: Record<string, string> = {
      "📊 סטטוס": "/status",
      "📦 ציוד חתום": "/equipment",
      "🚗 שבצ\"ק": "/dispatch",
      "ℹ️ מידע כללי": "/info",
      "❓ עזרה": "/help",
    };
    const cmd = CMD_MAP[text] || text;

    // /start — registration
    if (cmd === "/start") {
      await sendTelegramMessage(
        token,
        chatId,
        `שלום! 👋\nאני הבוט של <b>${battalion.name}</b> במערכת PALMY.\n\nשלח/י את <b>המספר האישי</b> שלך כדי להתחבר.`,
      );
      return NextResponse.json({ ok: true });
    }

    // /help
    if (cmd === "/help") {
      await sendTelegramMessage(token, chatId, HELP_TEXT, MAIN_KEYBOARD);
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

    if (cmd === "/status") {
      if (!soldier) {
        await sendTelegramMessage(token, chatId, NOT_REGISTERED);
        return NextResponse.json({ ok: true });
      }
      await handleStatus(token, chatId, soldier, battalion);
      return NextResponse.json({ ok: true });
    }

    if (cmd === "/equipment") {
      if (!soldier) {
        await sendTelegramMessage(token, chatId, NOT_REGISTERED);
        return NextResponse.json({ ok: true });
      }
      await handleEquipment(token, chatId, soldier);
      return NextResponse.json({ ok: true });
    }

    if (cmd === "/dispatch") {
      if (!soldier) {
        await sendTelegramMessage(token, chatId, NOT_REGISTERED);
        return NextResponse.json({ ok: true });
      }
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
      const webAppUrl = `${baseUrl}/bot/dispatch/${battalionId}`;
      await sendTelegramMessage(token, chatId, '🚗 <b>שבצ"ק חדש</b>\n\nלחץ על הכפתור למטה לפתיחת טופס שבצ"ק:', {
        inline_keyboard: [[{ text: "📝 פתח טופס שבצ\"ק", web_app: { url: webAppUrl } }]],
      });
      return NextResponse.json({ ok: true });
    }

    if (cmd === "/info") {
      const info = battalion.telegramBotInfo;
      if (!info) {
        await sendTelegramMessage(token, chatId, "ℹ️ לא הוגדר מידע כללי עדיין.\nפנה למפקד שיעדכן בהגדרות המערכת.");
      } else {
        await sendTelegramMessage(token, chatId, `ℹ️ <b>מידע כללי — ${battalion.name}</b>\n\n${info}`);
      }
      return NextResponse.json({ ok: true });
    }

    // Not a command — try personal number registration
    const personalNumber = cmd.replace(/\D/g, "");
    if (!personalNumber || personalNumber.length < 5) {
      await sendTelegramMessage(token, chatId, `לא הבנתי. ${HELP_TEXT}`, MAIN_KEYBOARD);
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
        `כבר מחובר/ת, ${target.fullName}! ✅`,
        MAIN_KEYBOARD,
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
      `מעולה, ${target.fullName}! ✅\nהתחברת בהצלחה למערכת PALMY.\n\nבחר/י מהתפריט למטה:`,
      MAIN_KEYBOARD,
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[Telegram webhook error]", e);
    return NextResponse.json({ ok: true });
  }
}

// --- Callback handler for inline verification buttons ---
async function handleCallback(
  token: string,
  callback: { id: string; data: string; message: { chat: { id: number }; message_id: number } },
  battalionId: string,
) {
  const chatId = String(callback.message.chat.id);
  const messageId = callback.message.message_id;
  const data = callback.data;

  // Format: verify:<itemId>:<found|denied>
  if (data.startsWith("verify:")) {
    const parts = data.split(":");
    if (parts.length < 3) {
      await answerCallbackQuery(token, callback.id, "שגיאה");
      return;
    }
    const itemId = parts[1];
    const found = parts[2] === "found";

    const item = await prisma.verificationItem.findUnique({
      where: { id: itemId },
      include: { request: { select: { id: true, token: true, respondedAt: true, items: true } } },
    });

    if (!item || item.respondedAt) {
      await answerCallbackQuery(token, callback.id, "כבר דווח");
      return;
    }

    // Update this item
    await prisma.verificationItem.update({
      where: { id: itemId },
      data: {
        status: found ? "CONFIRMED" : "DENIED",
        respondedAt: new Date(),
      },
    });

    // Check if all items in this request are now answered
    const allItems = await prisma.verificationItem.findMany({
      where: { requestId: item.request.id },
      select: { id: true, status: true, itemTypeName: true, serialNumber: true },
    });

    const allDone = allItems.every((i) => i.status !== "PENDING");

    if (allDone) {
      await prisma.verificationRequest.update({
        where: { id: item.request.id },
        data: { respondedAt: new Date() },
      });

      const summary = allItems.map((i) => {
        const icon = i.status === "CONFIRMED" ? "✅" : "❌";
        return `${icon} ${i.itemTypeName}${i.serialNumber ? ` (${i.serialNumber})` : ""}`;
      }).join("\n");

      await editMessageText(token, chatId, messageId, `📋 <b>אימות הושלם!</b>\n\n${summary}\n\nתודה על הדיווח! 🙏`);
      await answerCallbackQuery(token, callback.id, "הדיווח נקלט ✅");
    } else {
      // Update message to show progress
      const buttons = allItems.filter((i) => i.status === "PENDING").map((i) => ([
        { text: `✅ ${i.itemTypeName}`, callback_data: `verify:${i.id}:found` },
        { text: `❌`, callback_data: `verify:${i.id}:denied` },
      ]));

      const answered = allItems.filter((i) => i.status !== "PENDING").map((i) => {
        const icon = i.status === "CONFIRMED" ? "✅" : "❌";
        return `${icon} ${i.itemTypeName}${i.serialNumber ? ` (${i.serialNumber})` : ""}`;
      }).join("\n");

      const remaining = allItems.filter((i) => i.status === "PENDING").length;

      await editMessageText(
        token,
        chatId,
        messageId,
        `🔍 <b>אימות ציוד</b>\n\n${answered ? answered + "\n\n" : ""}נותרו ${remaining} פריטים:`,
        { inline_keyboard: buttons },
      );
      await answerCallbackQuery(token, callback.id, found ? "נמצא ✅" : "לא נמצא ❌");
    }
    return;
  }

  // Format: vbatch:<requestId>:<confirm|deny>
  if (data.startsWith("vbatch:")) {
    const parts = data.split(":");
    const requestId = parts[1];
    const confirmed = parts[2] === "confirm";

    const request = await prisma.verificationRequest.findUnique({
      where: { id: requestId },
      include: { items: true },
    });

    if (!request || request.respondedAt) {
      await answerCallbackQuery(token, callback.id, "כבר דווח");
      return;
    }

    await prisma.$transaction([
      ...request.items.map((item) =>
        prisma.verificationItem.update({
          where: { id: item.id },
          data: { status: confirmed ? "CONFIRMED" : "DENIED", respondedAt: new Date() },
        }),
      ),
      prisma.verificationRequest.update({
        where: { id: requestId },
        data: { respondedAt: new Date() },
      }),
    ]);

    const icon = confirmed ? "✅" : "❌";
    const label = confirmed ? "הכל נמצא" : "חסרים פריטים";
    const itemList = request.items.map((i) =>
      `${icon} ${i.itemTypeName}${i.serialNumber ? ` (${i.serialNumber})` : ""}`
    ).join("\n");

    await editMessageText(token, chatId, messageId, `📋 <b>אימות הושלם — ${label}</b>\n\n${itemList}\n\nתודה! 🙏`);
    await answerCallbackQuery(token, callback.id, `דווח: ${label}`);
    return;
  }

  await answerCallbackQuery(token, callback.id);
}

const HELP_TEXT = `📋 <b>פקודות זמינות:</b>

📊 <b>סטטוס</b> — סטטוס חתימה ומבחנים
📦 <b>ציוד חתום</b> — רשימת ציוד חתום עליך
🚗 <b>שבצ"ק</b> — יצירת שבצ"ק חדש
ℹ️ <b>מידע כללי</b> — ארוחות, תפילות ועוד
❓ <b>עזרה</b> — הודעה זו

השתמש/י בכפתורים למטה 👇`;

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

  // Signed items count (serial + quantity)
  const [signedSerialCount, signedQtyLines] = await Promise.all([
    prisma.serialUnit.count({ where: { signedSoldierId: soldier.id } }),
    prisma.transferLine.findMany({
      where: {
        transfer: { status: "COMPLETED", type: { in: ["SIGNOUT", "CHECKIN"] }, toSoldierId: soldier.id },
        serialUnitId: null,
      },
      select: { itemTypeId: true, quantity: true, transfer: { select: { type: true } } },
    }),
  ]);
  const qtyTypesMap = new Map<string, number>();
  for (const l of signedQtyLines) {
    const sign = l.transfer.type === "SIGNOUT" ? 1 : -1;
    qtyTypesMap.set(l.itemTypeId, (qtyTypesMap.get(l.itemTypeId) ?? 0) + sign * l.quantity);
  }
  const signedQtyCount = Array.from(qtyTypesMap.values()).filter((q) => q > 0).length;
  const signedCount = signedSerialCount + signedQtyCount;
  lines.push("");
  lines.push(`📦 פריטים חתומים: <b>${signedCount}</b>`);
  if (signedCount > 0) lines.push("לחץ <b>📦 ציוד חתום</b> לרשימה מלאה");

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
  const [serialItems, qtyLines] = await Promise.all([
    prisma.serialUnit.findMany({
      where: { signedSoldierId: soldier.id },
      select: { serialNumber: true, lotQuantity: true, itemType: { select: { name: true } } },
      orderBy: { itemType: { name: "asc" } },
    }),
    prisma.transferLine.findMany({
      where: {
        transfer: { status: "COMPLETED", type: { in: ["SIGNOUT", "CHECKIN"] }, toSoldierId: soldier.id },
        serialUnitId: null,
      },
      include: { itemType: { select: { name: true, unit: true } }, transfer: { select: { type: true } } },
    }),
  ]);

  const qtyMap = new Map<string, { name: string; unit: string; qty: number }>();
  for (const l of qtyLines) {
    const sign = l.transfer.type === "SIGNOUT" ? 1 : -1;
    const cur = qtyMap.get(l.itemTypeId);
    if (cur) { cur.qty += sign * l.quantity; }
    else { qtyMap.set(l.itemTypeId, { name: l.itemType.name, unit: l.itemType.unit, qty: sign * l.quantity }); }
  }
  const qtyItems = Array.from(qtyMap.values()).filter((q) => q.qty > 0).sort((a, b) => a.name.localeCompare(b.name));

  if (serialItems.length === 0 && qtyItems.length === 0) {
    await sendTelegramMessage(token, chatId, `📦 <b>${soldier.fullName}</b> — אין ציוד חתום כרגע.`);
    return;
  }

  const lines: string[] = [];
  lines.push(`📦 <b>ציוד חתום — ${soldier.fullName}</b>`);

  if (serialItems.length > 0) {
    lines.push("");
    lines.push(`<b>🔫 סריאלי / אצוות (${serialItems.length})</b>`);
    for (const item of serialItems) {
      const lot = item.lotQuantity && item.lotQuantity > 1 ? ` (אצווה ×${item.lotQuantity})` : "";
      lines.push(`• ${item.itemType.name} — <code>${item.serialNumber}</code>${lot}`);
    }
  }

  if (qtyItems.length > 0) {
    lines.push("");
    lines.push(`<b>📦 כמותי (${qtyItems.length})</b>`);
    for (const q of qtyItems) {
      lines.push(`• ${q.name} — ×${q.qty} ${q.unit}`);
    }
  }

  lines.push("");
  lines.push(`סה״כ: <b>${serialItems.length + qtyItems.length}</b> פריטים`);

  await sendTelegramMessage(token, chatId, lines.join("\n"));
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
}
