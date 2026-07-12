import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage, answerCallbackQuery, editMessageText, MAIN_KEYBOARD, buildMainKeyboard, buildVehicleKeyboard, buildTasksKeyboard } from "@/lib/telegram";
import { linkTokenQuery } from "@/lib/link-token";
import { normalizePhone } from "@/lib/phone";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ battalionId: string }> },
) {
  try {
    const { battalionId } = await params;

    // 🔒 אימות שהבקשה באמת מטלגרם — רק אם הוגדר TELEGRAM_WEBHOOK_SECRET (opt-in,
    //    כדי לא לשבור בוטים קיימים). לאחר הגדרת ה-env + רישום ה-webhook עם secret_token,
    //    כל POST מזויף (בלי ה-header התואם) נדחה.
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expectedSecret) {
      const provided = req.headers.get("x-telegram-bot-api-secret-token");
      if (provided !== expectedSecret) {
        return NextResponse.json({ ok: false }, { status: 401 });
      }
    }

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
    if (!message?.chat?.id) {
      return NextResponse.json({ ok: true });
    }

    const chatId = String(message.chat.id);

    // --- שיתוף מספר טלפון (שלב 2 בחיבור המאובטח) ---
    if (message.contact) {
      await handleContactShare(token, chatId, message, battalionId);
      return NextResponse.json({ ok: true });
    }

    // --- Photo handling: armory test proof upload ---
    if (message.photo?.length > 0) {
      await handlePhotoUpload(token, chatId, message.photo, battalionId);
      return NextResponse.json({ ok: true });
    }

    if (!message.text) {
      return NextResponse.json({ ok: true });
    }

    const text = message.text.trim();

    // Map Hebrew keyboard buttons to commands
    const CMD_MAP: Record<string, string> = {
      "🔫 נשקייה": "/status",
      "📦 הציוד שלי": "/equipment",
      "🚗 רכבים": "/vehicles",
      "⬅️ חזרה לתפריט": "/menu",
      "🚗 משימות ושבצ\"ק": "/dispatch",
      "🚗 שיבוץ לרכב": "/dispatch",
      "📋 משימות": "/tasks",
      "📋 משימות 🔴": "/tasks",
      "📊 ספירות מלאי": "/counts",
      "🗓️ דיווח כ\"א (דוח 1)": "/attendance",
      "🗓️ דיווח נוכחות": "/attendance",
      "📝 תעודות לחתימה": "/pendingsigns",
      "⛽ כרטיסי הדלק שלי": "/myfuel",
      "🕐 ארוחות ותפילות": "/info",
      "🪪 בדיקת הסמכות": "/license",
      "🪪 בדיקת רישיון": "/license",
      "📁 תיק נהג": "/driverforms",
      "📁 טפסי נהג": "/driverforms",
      "❓ עזרה": "/help",
      // backward compat — old button labels
      "📋 טפסים להחתמה": "/status",
      "📋 תהליך חתימת נשק": "/status",
      "📊 דיווחי כ\"א וספירות": "/tasks",
      "📊 סטטוס": "/status",
      "📦 ציוד חתום": "/equipment",
      "🚗 שבצ\"ק": "/dispatch",
      "ℹ️ מידע כללי": "/info",
    };
    const cmd = CMD_MAP[text] || text;

    // /start — registration (תומך ב-deep-link "/start <מספר אישי>" מהזמנת וואטסאפ — חיבור בקליק)
    if (cmd === "/start" || text.startsWith("/start ")) {
      const startParam = text.includes(" ") ? text.slice(text.indexOf(" ") + 1).trim().replace(/\D/g, "") : "";
      if (startParam.length >= 5) {
        const target = await prisma.soldier.findFirst({
          where: { battalionId, personalNumber: startParam },
          select: { id: true, fullName: true, telegramChatId: true },
        });
        if (target) {
          if (target.telegramChatId === chatId) {
            await sendTelegramMessage(token, chatId, `כבר מחובר/ת, ${target.fullName}! ✅`, MAIN_KEYBOARD);
            return NextResponse.json({ ok: true });
          }
          // 🔐 חיבור דו-שלבי: שומרים את המ.א וממתינים לשיתוף מספר טלפון לאימות
          await startBindChallenge(token, chatId, battalionId, startParam, target.fullName);
          return NextResponse.json({ ok: true });
        }
        // מספר לא נמצא — ממשיך להודעת הרישום הרגילה
      }
      await sendTelegramMessage(
        token,
        chatId,
        `שלום! 👋\nאני הבוט של <b>${battalion.name}</b> במערכת PALMY.\n\nשלח/י את <b>המספר האישי</b> שלך כדי להתחבר.`,
      );
      return NextResponse.json({ ok: true });
    }

    // טעינת החייל המקושר + תפקידו (לתפריט דינמי)
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
        civilianLicenseNumber: true,
        company: { select: { name: true } },
        squadId: true,
        isAttendanceReporter: true,
        appUser: { select: { id: true, role: true, holderId: true, assignedHolders: { select: { holderId: true } } } },
        _count: { select: { drivingLicenses: true, driverForms: true } },
      },
    });
    // מדווח נוכחות = רס"פ (COMPANY_REP) או נאמן כ"א שסומן
    const canAttendance = soldier?.appUser?.role === "COMPANY_REP" || !!soldier?.isAttendanceReporter;
    const mgr = soldier?.appUser;
    const canManageTeam = !!(mgr && (mgr.holderId || (mgr.assignedHolders?.length ?? 0) > 0));
    // נהג = יש רישיון/היתר, ריענון, רישיון אזרחי או טופס תיק נהג — מקבל כפתור טפסי נהג קבוע
    const isDriver = !!soldier && ((soldier._count?.drivingLicenses ?? 0) > 0 || (soldier._count?.driverForms ?? 0) > 0 || !!soldier.drivingRefresherDate || !!soldier.civilianLicenseNumber);
    // "📋 משימות" — מוצג אם יש ספירה פתוחה / הרשאת דיווח כ"א / תעודה לחתימה. 🔴 = יש פעולה ממתינה.
    let hasOpenCounts = false;
    let hasPendingSigs = false;
    if (soldier) {
      [hasOpenCounts, hasPendingSigs] = await Promise.all([
        prisma.countTask.count({
          where: { battalionId, status: { in: ["PENDING", "IN_PROGRESS", "OVERDUE"] },
            OR: [{ assignedUser: { soldier: { telegramChatId: chatId } } }, { holder: { users: { some: { soldier: { telegramChatId: chatId } } } } }] },
        }).then((n) => n > 0),
        prisma.signature.count({ where: { soldierId: soldier.id, status: "PENDING", OR: [{ tokenExpires: null }, { tokenExpires: { gt: new Date() } }] } }).then((n) => n > 0),
      ]);
    }
    const showTasks = canAttendance || hasOpenCounts || hasPendingSigs;
    const tasksPending = hasOpenCounts || hasPendingSigs; // פעולה שממתינה למשתמש (🔴)
    const keyboard = buildMainKeyboard(showTasks, tasksPending, isDriver);

    // /help
    if (cmd === "/help") {
      await sendTelegramMessage(token, chatId, HELP_TEXT, keyboard);
      return NextResponse.json({ ok: true });
    }

    // 🚗 רכבים — תת-תפריט המרכז את כל אפשרויות הרכב + קישורים שימושיים
    if (cmd === "/vehicles") {
      const links = await prisma.vehicleLink.findMany({
        where: { battalionId, visibleToSoldier: true, active: true },
        orderBy: { sortOrder: "asc" }, select: { name: true, url: true },
      });
      const linkLines = links.length ? "\n\n🔗 <b>קישורים שימושיים:</b>\n" + links.map((l) => `• <a href="${l.url}">${l.name}</a>`).join("\n") : "";
      await sendTelegramMessage(token, chatId,
        `🚗 <b>רכבים</b>\n\nבחר/י מהתפריט שנפתח למטה 👇\n` +
        `• 🚗 <b>משימות ושבצ"ק</b> — פתיחת משימה/נסיעה\n` +
        `• 📁 <b>תיק נהג</b> — מילוי וחתימה על טפסים\n` +
        `• 🪪 <b>בדיקת הסמכות</b> — ההסמכות שלי / בדיקת מ.א\n` +
        `• ⛽ <b>כרטיסי הדלק שלי</b>` +
        linkLines,
        buildVehicleKeyboard(canManageTeam, isDriver));
      return NextResponse.json({ ok: true });
    }
    // חזרה לתפריט הראשי
    if (cmd === "/menu") {
      await sendTelegramMessage(token, chatId, "🏠 תפריט ראשי", keyboard);
      return NextResponse.json({ ok: true });
    }

    // 📋 משימות — תת-תפריט: ספירות · דיווח כ"א · תעודות לחתימה
    if (cmd === "/tasks" || cmd === "/reports") {
      if (!soldier) { await sendTelegramMessage(token, chatId, NOT_REGISTERED); return NextResponse.json({ ok: true }); }
      const parts = ["📋 <b>משימות</b>\n\nבחר/י מהתפריט למטה 👇"];
      parts.push("• 📊 <b>ספירות מלאי</b>" + (hasOpenCounts ? " 🔴" : ""));
      if (canAttendance) parts.push("• 🗓️ <b>דיווח כ\"א (דוח 1)</b>");
      parts.push("• 📝 <b>תעודות לחתימה</b>" + (hasPendingSigs ? " 🔴" : ""));
      await sendTelegramMessage(token, chatId, parts.join("\n"), buildTasksKeyboard(canAttendance));
      return NextResponse.json({ ok: true });
    }

    // 📝 תעודות הממתינות לחתימת החייל
    if (cmd === "/pendingsigns") {
      if (!soldier) { await sendTelegramMessage(token, chatId, NOT_REGISTERED); return NextResponse.json({ ok: true }); }
      await handlePendingSigns(token, chatId, soldier, buildTasksKeyboard(canAttendance));
      return NextResponse.json({ ok: true });
    }

    // /attendance — דיווח נוכחות (רק למדווחי פלוגה) — לינק מאובטח ללא התחברות
    if (cmd === "/attendance") {
      if (!soldier || !canAttendance) {
        await sendTelegramMessage(token, chatId, "🗓️ דיווח נוכחות זמין לנאמני כ\"א / רס״פ בלבד.", keyboard);
        return NextResponse.json({ ok: true });
      }
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
      const link = `${baseUrl}/attendance-report/${soldier.id}${linkTokenQuery("attendance-report", soldier.id)}`;
      await sendTelegramMessage(token, chatId,
        `🗓️ <b>דיווח נוכחות (דוח 1) — ${battalion.name}</b>\n\n${soldier.fullName}, הרשימה תופיע ישר — רק לסמן ולשלוח (בלי התחברות):\n👉 <a href="${link}">פתח דיווח נוכחות</a>`, keyboard);
      return NextResponse.json({ ok: true });
    }

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

      const dispatchToken = nanoid(32);
      await prisma.dispatchToken.create({
        data: {
          token: dispatchToken,
          battalionId,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
          maxUses: 20,
        },
      });
      const openUrl = `${baseUrl}/dispatch-open/${dispatchToken}`;

      await sendTelegramMessage(token, chatId,
        `🚗 <b>פתיחת משימה (שבצ"ק)</b>\n\n` +
        `אשף שלב-אחר-שלב לשיירה — רכב אחד או יותר, בדיוק כמו במערכת (מערכת/חוץ, שבצ"ק קבוע, תפקידים ונהג).\n\n` +
        `👉 <a href="${openUrl}">לחץ כאן לפתיחת האשף</a>\n\n` +
        `<i>🔒 הקישור תקף ל-24 שעות</i>`);
      return NextResponse.json({ ok: true });
    }

    if (cmd === "/counts") {
      if (!soldier) {
        await sendTelegramMessage(token, chatId, NOT_REGISTERED);
        return NextResponse.json({ ok: true });
      }
      await handleCounts(token, chatId, soldier, battalionId);
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

    // 📁 טפסי נהג — זמין לכולם (מילוי/חתימה על טפסי תיק הנהג)
    if (cmd === "/driverforms") {
      if (!soldier) { await sendTelegramMessage(token, chatId, NOT_REGISTERED); return NextResponse.json({ ok: true }); }
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
      await sendTelegramMessage(token, chatId,
        `📁 <b>טפסי נהג — ${battalion.name}</b>\n\n${soldier.fullName}, למילוי וחתימה על טפסי תיק הנהג:\n👉 <a href="${baseUrl}/driver-form/${soldier.id}${linkTokenQuery("driver-form", soldier.id)}">לחץ כאן למילוי הטפסים</a>\n\n📸 <b>צילומי רישיון — הכי קל לשלוח כאן ישירות בבוט:</b>\nבחר/י סוג, ואז שלח/י את התמונה בצ'אט 👇`, LICENSE_PHOTO_KEYBOARD);
      return NextResponse.json({ ok: true });
    }

    // ⛽ כרטיסי הדלק שלי — הכרטיסים הפתוחים שהחייל מחזיק (נמצאים במסך רכבים, לא ציוד מחסן)
    if (cmd === "/myfuel") {
      if (!soldier) { await sendTelegramMessage(token, chatId, NOT_REGISTERED); return NextResponse.json({ ok: true }); }
      await handleMyFuel(token, chatId, soldier, buildVehicleKeyboard());
      return NextResponse.json({ ok: true });
    }

    // 🪪 בדיקת הסמכות — זמין לכולם. "/license" מציג את ההסמכות שלי + הסבר; "רישיון <מ.א>" בודק אחר
    if (cmd === "/license") {
      if (!soldier) { await sendTelegramMessage(token, chatId, NOT_REGISTERED); return NextResponse.json({ ok: true }); }
      await handleLicenseCheck(token, chatId, battalionId, soldier.personalNumber ?? "", "self");
      await sendTelegramMessage(token, chatId, "🪪 לבדיקת הסמכות של חייל אחר — שלח/י:\n<code>רישיון &lt;מספר אישי&gt;</code>\nלדוגמה: <code>רישיון 1234567</code>", keyboard);
      return NextResponse.json({ ok: true });
    }
    const licMatch = text.match(/^(?:רישיון|בדיקת רישיון)\s+(\d{5,})/);
    if (licMatch) {
      if (!soldier) { await sendTelegramMessage(token, chatId, NOT_REGISTERED); return NextResponse.json({ ok: true }); }
      await handleLicenseCheck(token, chatId, battalionId, licMatch[1], "other", keyboard);
      return NextResponse.json({ ok: true });
    }

    // Not a command — try personal number registration
    const personalNumber = cmd.replace(/\D/g, "");
    if (!personalNumber || personalNumber.length < 5) {
      await sendTelegramMessage(token, chatId, `לא הבנתי. ${HELP_TEXT}`, keyboard);
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

    // 🔐 חיבור דו-שלבי: שומרים את המ.א וממתינים לשיתוף מספר טלפון לאימות
    await startBindChallenge(token, chatId, battalionId, personalNumber, target.fullName);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[Telegram webhook error]", e);
    return NextResponse.json({ ok: true });
  }
}

// --- חיבור דו-שלבי לבוט: מ.א (שלב 1) + אימות מספר טלפון (שלב 2) ---
const SHARE_CONTACT_KEYBOARD = {
  keyboard: [[{ text: "📱 שתף מספר לאימות", request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

/** שלב 1: שומר את המ.א שהוקש וממתין לשיתוף מספר טלפון. */
async function startBindChallenge(token: string, chatId: string, battalionId: string, personalNumber: string, fullName: string) {
  await prisma.telegramBindChallenge.upsert({
    where: { battalionId_chatId: { battalionId, chatId } },
    update: { personalNumber, createdAt: new Date() },
    create: { battalionId, chatId, personalNumber },
  });
  await sendTelegramMessage(
    token, chatId,
    `כמעט שם, ${fullName}! 🔐\nלאימות זהות — שתף/י את מספר הטלפון שלך בלחיצה על הכפתור למטה.\n(רק המספר שלך; חייב להתאים למספר הרשום במערכת)`,
    SHARE_CONTACT_KEYBOARD,
  );
}

/** שלב 2: מקבל מספר משותף, מאמת מול המ.א, ומחבר רק אם תואם. */
async function handleContactShare(
  token: string, chatId: string,
  message: { contact?: { phone_number?: string; user_id?: number }; from?: { id?: number } },
  battalionId: string,
) {
  const contact = message.contact;
  const fromId = message.from?.id;
  // חייב לשתף את המספר של עצמו (לא איש קשר אחר / מועבר)
  if (!contact?.phone_number || (contact.user_id != null && fromId != null && String(contact.user_id) !== String(fromId))) {
    await sendTelegramMessage(token, chatId, "⚠️ יש לשתף את <b>המספר שלך</b> דרך הכפתור, לא איש קשר אחר.");
    return;
  }
  const challenge = await prisma.telegramBindChallenge.findUnique({ where: { battalionId_chatId: { battalionId, chatId } } });
  if (!challenge) {
    await sendTelegramMessage(token, chatId, "כדי להתחבר — שלח/י קודם את <b>המספר האישי</b> שלך.");
    return;
  }
  const soldier = await prisma.soldier.findFirst({
    where: { battalionId, personalNumber: challenge.personalNumber },
    select: { id: true, fullName: true, phone: true, telegramChatId: true },
  });
  await prisma.telegramBindChallenge.delete({ where: { battalionId_chatId: { battalionId, chatId } } }).catch(() => {});
  if (!soldier) {
    await sendTelegramMessage(token, chatId, "מספר אישי לא נמצא. התחל/י מחדש עם המספר האישי.");
    return;
  }
  const shared = normalizePhone(contact.phone_number);
  const onFile = normalizePhone(soldier.phone);
  if (!onFile) {
    await sendTelegramMessage(token, chatId, "⛔ אין מספר טלפון רשום עבורך במערכת.\nפנה/י למפקד/שלישות להוספת המספר, ואז נסה/י שוב.");
    return;
  }
  if (shared !== onFile) {
    await sendTelegramMessage(token, chatId, `⛔ המספר ששיתפת אינו תואם למספר האישי ${challenge.personalNumber} במערכת.\nאם החלפת מספר — פנה/י למפקד/שלישות לעדכון.`);
    return;
  }
  // ✅ שני השלבים אומתו — מחברים
  const prevChat = soldier.telegramChatId;
  await prisma.soldier.update({ where: { id: soldier.id }, data: { telegramChatId: chatId } });
  if (prevChat && prevChat !== chatId) {
    await sendTelegramMessage(token, prevChat, "ℹ️ החשבון שלך חובר למכשיר חדש (מאומת בטלפון). אם זה לא אתה — דווח/י לשלישות.").catch(() => {});
  }
  await sendTelegramMessage(token, chatId, `מעולה, ${soldier.fullName}! ✅\nהתחברת בהצלחה (מאומת בטלפון) למערכת PALMY.\n\n${HELP_TEXT}`, MAIN_KEYBOARD);
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

  // חתימה על נוהל נהיגה: signproc:<soldierId> — רק החייל עצמו (התאמת chatId)
  if (data.startsWith("signproc:")) {
    const soldierId = data.split(":")[1];
    const soldier = await prisma.soldier.findFirst({
      where: { id: soldierId, battalionId, telegramChatId: chatId },
      select: { id: true, fullName: true, drivingProcedureSignedAt: true },
    });
    if (!soldier) { await answerCallbackQuery(token, callback.id, "שגיאה"); return; }
    if (!soldier.drivingProcedureSignedAt) {
      await prisma.soldier.update({ where: { id: soldier.id }, data: { drivingProcedureSignedAt: new Date() } });
    }
    await answerCallbackQuery(token, callback.id, "נחתם! ✅");
    await editMessageText(token, chatId, messageId, `✅ <b>חתמת על נוהל הנהיגה</b>\nתודה, ${soldier.fullName}.`);
    return;
  }

  // בחירת סוג צילום רישיון — התמונה הבאה שתישלח תישמר לשדה הזה
  if (data.startsWith("licphoto:")) {
    const target = data.split(":")[1];
    if (!["civFront", "civBack", "milFront"].includes(target)) { await answerCallbackQuery(token, callback.id, "שגיאה"); return; }
    const soldier = await prisma.soldier.findFirst({ where: { battalionId, telegramChatId: chatId }, select: { id: true } });
    if (!soldier) { await answerCallbackQuery(token, callback.id, "לא מחובר"); return; }
    await prisma.telegramPhotoRequest.upsert({
      where: { battalionId_chatId: { battalionId, chatId } },
      update: { target, createdAt: new Date() },
      create: { battalionId, chatId, target },
    });
    const label = target === "civFront" ? "רישיון אזרחי — קדימה" : target === "civBack" ? "רישיון אזרחי — אחורה" : "רישיון צבאי — קדימה";
    await answerCallbackQuery(token, callback.id, "עכשיו שלח/י את התמונה 📸");
    await sendTelegramMessage(token, chatId, `📸 <b>${label}</b>\nשלח/י עכשיו את התמונה כאן בצ'אט (מצלמה או גלריה של טלגרם — עובד תמיד).`);
    return;
  }

  // עדכון מיקום — שלב 1: בחירת פריט → הצגת רשימת מיקומים אפשריים (פלוגת החייל)
  if (data.startsWith("setloc:")) {
    const serialUnitId = data.split(":")[1];
    const unit = await prisma.serialUnit.findFirst({
      where: { id: serialUnitId, signedSoldier: { telegramChatId: chatId }, itemType: { allowLocationUpdate: true } },
      select: { serialNumber: true, itemType: { select: { name: true } }, signedSoldier: { select: { companyId: true } } },
    });
    if (!unit) { await answerCallbackQuery(token, callback.id, "לא ניתן לעדכן פריט זה"); return; }
    const holderId = unit.signedSoldier?.companyId;
    const locs = holderId ? await prisma.equipmentLocation.findMany({ where: { holderId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [];
    if (locs.length === 0) { await answerCallbackQuery(token, callback.id, "אין מיקומים מוגדרים לפלוגה"); return; }
    await answerCallbackQuery(token, callback.id, "");
    await editMessageText(token, chatId, messageId, `📍 <b>${unit.itemType.name} · ${unit.serialNumber}</b>\nבחר/י מיקום חדש:`, {
      inline_keyboard: locs.map((l) => [{ text: l.name, callback_data: `putloc:${serialUnitId}:${l.id}` }]),
    });
    return;
  }

  // עדכון מיקום — שלב 2: קביעת המיקום שנבחר
  if (data.startsWith("putloc:")) {
    const [, serialUnitId, locId] = data.split(":");
    const unit = await prisma.serialUnit.findFirst({
      where: { id: serialUnitId, signedSoldier: { telegramChatId: chatId }, itemType: { allowLocationUpdate: true } },
      select: { serialNumber: true, itemType: { select: { name: true } }, signedSoldier: { select: { companyId: true } } },
    });
    if (!unit) { await answerCallbackQuery(token, callback.id, "שגיאה"); return; }
    const loc = await prisma.equipmentLocation.findFirst({ where: { id: locId, holderId: unit.signedSoldier?.companyId ?? undefined, active: true }, select: { name: true } });
    if (!loc) { await answerCallbackQuery(token, callback.id, "מיקום לא תקין"); return; }
    await prisma.serialUnit.update({ where: { id: serialUnitId }, data: { equipmentLocationId: locId } });
    await answerCallbackQuery(token, callback.id, "המיקום עודכן ✅");
    await editMessageText(token, chatId, messageId, `✅ <b>המיקום עודכן</b>\n${unit.itemType.name} · ${unit.serialNumber}\n📍 ${loc.name}`);
    return;
  }

  // סגירת משימה ע"י מפקד המשימה: mclose:<missionId> — רק המפקד שהוגדר (התאמת chatId)
  if (data.startsWith("mclose:")) {
    const missionId = data.split(":")[1];
    const mission = await prisma.mission.findFirst({
      where: { id: missionId, battalionId, commanderSoldier: { is: { telegramChatId: chatId } } },
      select: { id: true, title: true, completedAt: true, commanderSoldierId: true },
    });
    if (!mission) { await answerCallbackQuery(token, callback.id, "לא נמצאה משימה / אינך המפקד"); return; }
    if (mission.completedAt) {
      await answerCallbackQuery(token, callback.id, "המשימה כבר הסתיימה");
      await editMessageText(token, chatId, messageId, `✅ <b>${mission.title || "המשימה"}</b> — כבר סומנה כהסתיימה.`);
      return;
    }
    await prisma.mission.update({ where: { id: mission.id }, data: { completedAt: new Date(), completedById: null } });
    await answerCallbackQuery(token, callback.id, "המשימה הסתיימה ✅");
    await editMessageText(token, chatId, messageId, `✅ <b>המשימה הסתיימה</b>\n${mission.title || "נסיעה"} — סומנה כהושלמה. תודה!`);
    return;
  }

  // דיווח הקמת הרשאת נסיעה: tripok:<vehicleAssignmentSoldierId> — הנהג עצמו או קצין רכב
  if (data.startsWith("tripok:")) {
    const vasId = data.split(":")[1];
    const vas = await prisma.vehicleAssignmentSoldier.findFirst({
      where: { id: vasId, assignment: { battalionId } },
      select: { id: true, tripConfirmedAt: true, soldier: { select: { fullName: true, telegramChatId: true } } },
    });
    if (!vas) { await answerCallbackQuery(token, callback.id, "שגיאה"); return; }
    const isDriver = vas.soldier?.telegramChatId === chatId;
    let via: string | null = isDriver ? "נהג (בוט)" : null;
    if (!isDriver) {
      // קצין רכב מאשר בשם הנהג
      const officer = await prisma.appUser.findFirst({
        where: {
          battalionId, active: true, soldier: { is: { telegramChatId: chatId } },
          OR: [{ holder: { warehouseType: "VEHICLES" } }, { assignedHolders: { some: { holder: { warehouseType: "VEHICLES" } } } }],
        },
        select: { fullName: true },
      });
      if (officer) via = `${officer.fullName} (קצין רכב)`;
    }
    if (!via) { await answerCallbackQuery(token, callback.id, "אין הרשאה לאשר"); return; }
    if (!vas.tripConfirmedAt) {
      await prisma.vehicleAssignmentSoldier.update({ where: { id: vas.id }, data: { tripConfirmedAt: new Date(), tripConfirmedVia: via } });
    }
    await answerCallbackQuery(token, callback.id, "דווח ✅");
    await editMessageText(token, chatId, messageId, `✅ <b>הרשאת נסיעה הוקמה</b> — ${vas.soldier?.fullName || "נהג"}.\nדווח ע"י: ${via}. תודה!`);
    return;
  }

  // פתיחת שמ"פ ע"י השלישות: openshmap:<soldierId>:<offsetDays> — רק בעל הרשאת roster
  if (data.startsWith("openshmap:")) {
    const parts = data.split(":");
    const soldierId = parts[1];
    const offset = parseInt(parts[2] || "0", 10) || 0;
    const approver = await prisma.appUser.findFirst({
      where: {
        battalionId, active: true, soldier: { is: { telegramChatId: chatId } },
        OR: [{ systemRole: { permissions: { some: { screen: "roster", level: "EDIT" } } } }, { role: { in: ["SHALISH", "BATTALION_ADMIN"] } }],
      },
      select: { id: true, fullName: true },
    });
    if (!approver) { await answerCallbackQuery(token, callback.id, "אין הרשאה לפתיחת שמ\"פ"); return; }
    const soldier = await prisma.soldier.findFirst({ where: { id: soldierId, battalionId }, select: { id: true, fullName: true } });
    if (!soldier) { await answerCallbackQuery(token, callback.id, "חייל לא נמצא"); return; }
    const existing = await prisma.callupPeriod.findFirst({ where: { soldierId, endDate: null }, select: { id: true } });
    if (existing) {
      await answerCallbackQuery(token, callback.id, "כבר יש שמ\"פ פתוח");
      await editMessageText(token, chatId, messageId, `ℹ️ ל<b>${soldier.fullName}</b> כבר יש שמ"פ פתוח.`);
      return;
    }
    // תאריך התחלה = היום (שעון ישראל) פחות offset ימים, כחצות UTC
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
    const start = new Date(ymd + "T00:00:00.000Z");
    start.setUTCDate(start.getUTCDate() - offset);
    await prisma.callupPeriod.create({ data: { soldierId, startDate: start, createdById: approver.id } });
    await answerCallbackQuery(token, callback.id, "שמ\"פ נפתח ✅");
    await editMessageText(token, chatId, messageId, `✅ <b>שמ"פ נפתח</b>\n${soldier.fullName} — מתאריך ${start.toISOString().slice(0, 10)}.\nאושר ע"י: ${approver.fullName}.`);
    return;
  }

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
        const icon = i.status === "CONFIRMED" ? "✅ נמצא" : "❌ חסר";
        const sn = i.serialNumber ? `\n   🔢 <code>${i.serialNumber}</code>` : "";
        return `${icon} — <b>${i.itemTypeName}</b>${sn}`;
      }).join("\n");

      await editMessageText(token, chatId, messageId, `📋 <b>אימות הושלם!</b>\n\n${summary}\n\nתודה על הדיווח! 🙏`);
      await answerCallbackQuery(token, callback.id, "הדיווח נקלט ✅");
    } else {
      // Update message to show progress
      const buttons = allItems.filter((i) => i.status === "PENDING").map((i) => ([
        { text: `✅ נמצא — ${i.itemTypeName}${i.serialNumber ? ` (${i.serialNumber})` : ""}`, callback_data: `verify:${i.id}:found` },
        { text: `❌ חסר`, callback_data: `verify:${i.id}:denied` },
      ]));

      const answered = allItems.filter((i) => i.status !== "PENDING").map((i) => {
        const icon = i.status === "CONFIRMED" ? "✅ נמצא" : "❌ חסר";
        const sn = i.serialNumber ? `\n   🔢 <code>${i.serialNumber}</code>` : "";
        return `${icon} — <b>${i.itemTypeName}</b>${sn}`;
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

    const icon = confirmed ? "✅ נמצא" : "❌ חסר";
    const label = confirmed ? "הכל נמצא" : "חסרים פריטים";
    const itemList = request.items.map((i) => {
      const sn = i.serialNumber ? `\n   🔢 <code>${i.serialNumber}</code>` : "";
      return `${icon} — <b>${i.itemTypeName}</b>${sn}`;
    }).join("\n");

    await editMessageText(token, chatId, messageId, `📋 <b>אימות הושלם — ${label}</b>\n\n${itemList}\n\nתודה! 🙏`);
    await answerCallbackQuery(token, callback.id, `דווח: ${label}`);
    return;
  }

  // Format: delegate:<taskId>
  if (data.startsWith("delegate:")) {
    const taskId = data.split(":")[1];
    const task = await prisma.countTask.findUnique({
      where: { id: taskId },
      include: { holder: { select: { name: true, users: { where: { active: true }, select: { id: true, fullName: true, soldier: { select: { telegramChatId: true } } } } } } },
    });
    if (!task || task.sessionId) {
      await answerCallbackQuery(token, callback.id, "המשימה כבר בביצוע");
      return;
    }
    const candidates = task.holder.users.filter((u) => u.id !== task.assignedUserId);
    if (candidates.length === 0) {
      await answerCallbackQuery(token, callback.id, "אין משתמשים נוספים");
      return;
    }
    const buttons = candidates.map((u) => ([
      { text: u.fullName, callback_data: `delegateto:${taskId}:${u.id}` },
    ]));
    await editMessageText(token, chatId, messageId,
      `🔄 <b>האצלת משימה — ${task.holder.name}</b>\n\nלמי להאציל?`,
      { inline_keyboard: buttons },
    );
    await answerCallbackQuery(token, callback.id);
    return;
  }

  // Format: delegateto:<taskId>:<userId>
  if (data.startsWith("delegateto:")) {
    const parts = data.split(":");
    const taskId = parts[1];
    const newUserId = parts[2];
    const task = await prisma.countTask.findUnique({
      where: { id: taskId },
      include: { holder: { select: { name: true } }, plan: { select: { name: true } } },
    });
    if (!task || task.sessionId) {
      await answerCallbackQuery(token, callback.id, "המשימה כבר בביצוע");
      return;
    }
    const newUser = await prisma.appUser.findUnique({
      where: { id: newUserId },
      select: { id: true, fullName: true, soldier: { select: { telegramChatId: true } } },
    });
    if (!newUser) {
      await answerCallbackQuery(token, callback.id, "משתמש לא נמצא");
      return;
    }
    await prisma.countTask.update({ where: { id: taskId }, data: { assignedUserId: newUserId } });
    await editMessageText(token, chatId, messageId,
      `✅ <b>המשימה הואצלה ל-${newUser.fullName}</b>\n\n📍 ${task.holder.name} · ${task.plan?.name ?? "ספירה"}`,
    );
    await answerCallbackQuery(token, callback.id, `הואצל ל-${newUser.fullName}`);
    // Notify new assignee
    const newChatId = newUser.soldier?.telegramChatId;
    if (newChatId) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
      const due = task.dueAt.toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      await sendTelegramMessage(token, newChatId, [
        `🔄 <b>הואצלה אליך משימת ספירה</b>`,
        ``,
        `מחזיק: <b>${task.holder.name}</b>`,
        `תכנית: ${task.plan?.name ?? "ספירה"}`,
        `עד: ${due}`,
        ``,
        `👉 <a href="${baseUrl}/counts/share/${task.shareToken}">לחץ כאן לביצוע</a>`,
      ].join("\n")).catch(() => {});
    }
    return;
  }

  await answerCallbackQuery(token, callback.id);
}

const HELP_TEXT = `📋 <b>מה כל כפתור עושה:</b>

🔫 <b>נשקייה</b> — שלבי החתמת הנשק (אישור מפקד, מבחן ארמון, חתימה על נוהל) + רשימת הצל"ם הסריאלי שחתום עליך מול הארמון

📦 <b>הציוד שלי</b> — כל הציוד החתום עליך, מחולק לסריאלי/אצוות מול כמותי (עם מיקום). פריט עם ✏️ — ניתן לעדכן לו מיקום

🚗 <b>רכבים</b> — משימות ושבצ"ק · תיק נהג · בדיקת הסמכות · כרטיסי הדלק שלי · קישורים שימושיים

📋 <b>משימות</b> — ספירות מלאי · דיווח כ"א (דוח 1) · תעודות לחתימה (🔴 = יש פעולה שממתינה לך)

🕐 <b>ארוחות ותפילות</b> — זמני ארוחות, תפילות ומידע כללי שהמפקד הגדיר

🔔 <b>חשוב:</b> כדי לקבל התראה עם צליל — ודא/י שהתראות דלוקות לצ'אט הזה: לחיצה על שם הבוט למעלה ◄ Notifications ◄ הפעל צליל.

השתמש/י בכפתורים למטה 👇`;

const NOT_REGISTERED = "⚠️ לא מחובר למערכת.\nשלח/י את המספר האישי כדי להתחבר.";

// כפתורי בחירת סוג צילום רישיון (שליחה ישירה בבוט — עוקף את מצלמת ה-WebView)
const LICENSE_PHOTO_KEYBOARD = {
  inline_keyboard: [
    [{ text: "🪪 אזרחי — קדימה", callback_data: "licphoto:civFront" }, { text: "🪪 אזרחי — אחורה", callback_data: "licphoto:civBack" }],
    [{ text: "🎖️ צבאי — קדימה", callback_data: "licphoto:milFront" }],
  ],
};

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
  lines.push(`🔫 <b>נשקייה — ${soldier.fullName}</b>`);
  if (soldier.company) lines.push(`📍 ${soldier.company.name}`);
  lines.push("");

  // Weapon signing status
  lines.push("<b>📋 טפסים להחתמה:</b>");

  const step1 = soldier.weaponsApprovedAt;
  lines.push(`${step1 ? "✅" : "⬜"} אישור מג״ד/סמג״ד${step1 ? ` (${fmtDate(step1)})` : ""}`);

  const step2 = soldier.armoryTestProofAt;
  lines.push(`${step2 ? "✅" : "⬜"} מבחן נוהל ארמון${step2 ? ` (${fmtDate(step2)})` : ""}`);
  if (!step2) {
    if (battalion.armoryTestUrl) {
      lines.push(`   👉 <a href="${battalion.armoryTestUrl}">לחץ כאן למבחן</a>`);
    }
    lines.push(`   📸 שלח צילום מסך של תוצאת המבחן כדי לאשר`);
  }

  const step3 = soldier.weaponsAgreementSignedAt;
  lines.push(`${step3 ? "✅" : "⬜"} חתימה על נוהל שמירת נשק${step3 ? ` (${fmtDate(step3)})` : ""}`);
  if (!step3) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
    lines.push(`   👉 <a href="${baseUrl}/weapons-sign/${soldier.id}${linkTokenQuery("weapons-sign", soldier.id)}">לחץ כאן לחתימה על הנוהל</a> (נכנס ישר, חותם, זהו)`);
  }

  const allDone = step1 && step2 && step3;
  lines.push("");
  lines.push(allDone ? "✅ <b>כל השלבים הושלמו — ניתן לחתום על נשק</b>" : "⏳ <b>יש שלבים שלא הושלמו</b>");

  // צל"ם סריאלי חתום מול הארמון — רשימה מלאה (נשק, אמל"ח, כוונות וכו')
  const serialItems = await prisma.serialUnit.findMany({
    where: { signedSoldierId: soldier.id },
    select: { serialNumber: true, lotQuantity: true, itemType: { select: { name: true } } },
    orderBy: { itemType: { name: "asc" } },
  });
  // 📝 תעודות הממתינות לחתימת החייל (transfer/העברה/דלק וכו')
  const pendingSigs = await prisma.signature.findMany({
    where: { soldierId: soldier.id, status: "PENDING", OR: [{ tokenExpires: null }, { tokenExpires: { gt: new Date() } }] },
    orderBy: { createdAt: "desc" },
    select: { token: true, transfer: { select: { reason: true, lines: { select: { itemType: { select: { name: true } } }, take: 3 } } } },
  });
  if (pendingSigs.length > 0) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
    lines.push("");
    lines.push(`<b>📝 תעודות הממתינות לחתימתך (${pendingSigs.length}):</b>`);
    for (const s of pendingSigs) {
      const items = s.transfer?.lines.map((l) => l.itemType.name).filter(Boolean).join(", ");
      const label = s.transfer?.reason || items || "תעודת ציוד";
      lines.push(`• <a href="${baseUrl}/sign/${s.token}">✍️ ${label}</a>`);
    }
  }

  lines.push("");
  if (serialItems.length > 0) {
    lines.push(`<b>🔫 צל"ם סריאלי חתום (${serialItems.length}):</b>`);
    for (const item of serialItems) {
      const lot = item.lotQuantity && item.lotQuantity > 1 ? ` (אצווה ×${item.lotQuantity})` : "";
      lines.push(`• ${item.itemType.name} — <code>${item.serialNumber}</code>${lot}`);
    }
  } else {
    lines.push("🔫 אין צל\"ם סריאלי חתום כרגע.");
  }

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

  // נוהל נהיגה — חתימה עצמית בבוט (רק לחייל בעל רישיונות/היתרים, אם יש נוסח נוהל וטרם חתם על הגרסה בתוקף)
  try {
    const drv = await prisma.soldier.findUnique({
      where: { id: soldier.id },
      select: {
        drivingProcedureSignedAt: true,
        _count: { select: { drivingLicenses: true } },
        battalion: { select: { drivingProcedureText: true, drivingProcedureUpdatedAt: true } },
      },
    });
    const procText = drv?.battalion?.drivingProcedureText?.trim();
    if (drv && drv._count.drivingLicenses > 0 && procText) {
      const upd = drv.battalion!.drivingProcedureUpdatedAt;
      const signed = drv.drivingProcedureSignedAt;
      const valid = !!signed && (!upd || signed >= upd);
      if (!valid) {
        const head = signed ? "🚗 <b>נוהל נהיגה עודכן — נדרשת חתימה מחדש</b>" : "🚗 <b>נוהל נהיגה — נדרשת חתימה</b>";
        const body = procText.length > 3500 ? procText.slice(0, 3500) + "…" : procText;
        await sendTelegramMessage(token, chatId, `${head}\n\n${body}\n\nבלחיצה על הכפתור הינך מאשר/ת שקראת והבנת את הנוהל.`, {
          inline_keyboard: [[{ text: "✍️ אני מאשר וחותם", callback_data: `signproc:${soldier.id}` }]],
        });
      }
    }
  } catch { /* non-fatal */ }
}

async function handleEquipment(token: string, chatId: string, soldier: SoldierCtx) {
  const [serialItems, qtyLines] = await Promise.all([
    prisma.serialUnit.findMany({
      where: { signedSoldierId: soldier.id, itemType: { category: { warehouseType: { not: "VEHICLES" } } } },
      select: { id: true, serialNumber: true, lotQuantity: true, itemType: { select: { name: true, allowLocationUpdate: true } }, equipmentLocation: { select: { name: true } } },
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
      const loc = item.equipmentLocation ? ` · 📍 ${item.equipmentLocation.name}` : "";
      const editable = item.itemType.allowLocationUpdate ? " ✏️" : "";
      lines.push(`• ${item.itemType.name} — <code>${item.serialNumber}</code>${lot}${loc}${editable}`);
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

  // פריטים שהחייל רשאי לעדכן להם מיקום — כפתורי inline לעדכון
  const editableItems = serialItems.filter((i) => i.itemType.allowLocationUpdate);
  await sendTelegramMessage(token, chatId, lines.join("\n"));
  if (editableItems.length > 0) {
    await sendTelegramMessage(token, chatId, "✏️ <b>עדכון מיקום</b> — בחר/י פריט לעדכון:", {
      inline_keyboard: editableItems.map((i) => [{ text: `📍 ${i.itemType.name} · ${i.serialNumber}`, callback_data: `setloc:${i.id}` }]),
    });
  }
}

/** ⛽ כרטיסי הדלק הפתוחים של החייל (מסך רכבים — לא ציוד מחסן). */
async function handleMyFuel(token: string, chatId: string, soldier: SoldierCtx, keyboard: unknown) {
  const cards = await prisma.vehicleFuelCard.findMany({
    where: { soldierId: soldier.id, returnedAt: null },
    orderBy: { checkoutAt: "desc" },
    select: { cardNumber: true, checkoutAt: true, signedAt: true },
  });
  if (cards.length === 0) {
    await sendTelegramMessage(token, chatId, `⛽ <b>${soldier.fullName}</b> — אין לך כרטיסי דלק פתוחים.`, keyboard as never);
    return;
  }
  const lines = [`⛽ <b>כרטיסי דלק — ${soldier.fullName}</b>`, ""];
  for (const c of cards) {
    const days = Math.floor((Date.now() - new Date(c.checkoutAt).getTime()) / 86400000);
    const sig = c.signedAt ? "✍️" : "◌";
    lines.push(`${sig} כרטיס <code>${c.cardNumber}</code> — נמשך ${fmtDate(c.checkoutAt)} (${days} י׳)`);
  }
  lines.push("");
  lines.push("<i>✍️ = נחתם · ◌ = ממתין לחתימה</i>");
  await sendTelegramMessage(token, chatId, lines.join("\n"), keyboard as never);
}

/** 🪪 בדיקת הסמכות נהיגה — לעצמי (self) או לחייל אחר (other). */
async function handleLicenseCheck(token: string, chatId: string, battalionId: string, pn: string, mode: "self" | "other", keyboard?: unknown) {
  if (!pn) { await sendTelegramMessage(token, chatId, "🪪 אין לך מספר אישי רשום.", keyboard as never); return; }
  const target = await prisma.soldier.findFirst({
    where: { battalionId, personalNumber: pn },
    select: {
      fullName: true, drivingRefresherDate: true, civilianLicenseExpiry: true, civilianLicenseGrade: true,
      company: { select: { name: true } },
      drivingLicenses: { select: { licenseTypeId: true, licenseType: { select: { name: true, kind: true } } } },
      driverFileApprovedAt: true,
    },
  });
  if (!target) { await sendTelegramMessage(token, chatId, `🪪 לא נמצא חייל עם מ.א ${pn}.`, keyboard as never); return; }

  const [bat, vtl] = await Promise.all([
    prisma.battalion.findUnique({ where: { id: battalionId }, select: { drivingRefreshDays: true } }),
    prisma.vehicleTypeLicense.findMany({ where: { itemType: { battalionId } }, select: { licenseTypeId: true, itemType: { select: { id: true, name: true } } } }),
  ]);
  const has = new Set(target.drivingLicenses.map((l) => l.licenseTypeId));
  const byVehicle = new Map<string, { name: string; required: string[] }>();
  for (const r of vtl) { const v = byVehicle.get(r.itemType.id) ?? { name: r.itemType.name, required: [] }; v.required.push(r.licenseTypeId); byVehicle.set(r.itemType.id, v); }
  const allowed = [...byVehicle.values()].filter((v) => v.required.every((id) => has.has(id))).map((v) => v.name);

  const refreshDays = bat?.drivingRefreshDays ?? 180;
  let refreshLine = "❌ לא בוצע ריענון";
  if (target.drivingRefresherDate) {
    const exp = new Date(target.drivingRefresherDate); exp.setDate(exp.getDate() + refreshDays);
    const days = Math.ceil((exp.getTime() - Date.now()) / 86400000);
    refreshLine = days < 0 ? `🔴 ריענון פג (${target.drivingRefresherDate.toISOString().slice(0, 10)})` : `🟢 ריענון תקף — ${target.drivingRefresherDate.toISOString().slice(0, 10)} (עוד ${days} י׳)`;
  }
  let civLine = "—";
  if (target.civilianLicenseExpiry) {
    const d = Math.ceil((target.civilianLicenseExpiry.getTime() - Date.now()) / 86400000);
    civLine = `${target.civilianLicenseExpiry.toISOString().slice(0, 10)} ${d < 0 ? "🔴 פג" : d < 30 ? `🟡 עוד ${d} י׳` : "🟢"}`;
  }
  const licNames = target.drivingLicenses.filter((l) => l.licenseType.kind === "LICENSE").map((l) => l.licenseType.name);
  const permitNames = target.drivingLicenses.filter((l) => l.licenseType.kind !== "LICENSE").map((l) => l.licenseType.name);

  const header = mode === "self" ? `🪪 <b>ההסמכות שלי — ${target.fullName}</b>` : `🪪 <b>${target.fullName}</b> · ${target.company?.name ?? "—"} (מ.א ${pn})`;
  const msg = [
    header, ``,
    `רישיונות: ${licNames.join(", ") || "—"}${target.civilianLicenseGrade ? ` (${target.civilianLicenseGrade})` : ""}`,
    `היתרים: ${permitNames.join(", ") || "—"}`,
    `תוקף רישיון אזרחי: ${civLine}`,
    refreshLine,
    `תיק נהג: ${target.driverFileApprovedAt ? "✅ מאושר" : "⚠️ לא מאושר"}`,
    ``,
    `🚗 <b>מורשה לנהוג ב:</b>`,
    allowed.length ? allowed.map((n) => `• ${n}`).join("\n") : "— אין רכב שהוא מורשה לנהוג בו",
  ].join("\n");
  await sendTelegramMessage(token, chatId, msg, keyboard as never);
}

/** 📝 רשימת תעודות הממתינות לחתימת החייל (עם לינקים לחתימה). */
async function handlePendingSigns(token: string, chatId: string, soldier: SoldierCtx, keyboard: unknown) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
  const sigs = await prisma.signature.findMany({
    where: { soldierId: soldier.id, status: "PENDING", OR: [{ tokenExpires: null }, { tokenExpires: { gt: new Date() } }] },
    orderBy: { createdAt: "desc" },
    select: { token: true, transfer: { select: { reason: true, lines: { select: { itemType: { select: { name: true } } }, take: 3 } } } },
  });
  if (sigs.length === 0) { await sendTelegramMessage(token, chatId, `📝 <b>${soldier.fullName}</b> — אין תעודות הממתינות לחתימתך ✅`, keyboard as never); return; }
  const lines = [`📝 <b>תעודות הממתינות לחתימתך (${sigs.length}):</b>`, ""];
  for (const s of sigs) {
    const items = s.transfer?.lines.map((l) => l.itemType.name).filter(Boolean).join(", ");
    const label = s.transfer?.reason || items || "תעודת ציוד";
    lines.push(`• <a href="${baseUrl}/sign/${s.token}">✍️ ${label}</a>`);
  }
  await sendTelegramMessage(token, chatId, lines.join("\n"), keyboard as never);
}

async function handleCounts(token: string, chatId: string, soldier: SoldierCtx, battalionId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";

  const tasks = await prisma.countTask.findMany({
    where: {
      battalionId,
      status: { in: ["PENDING", "IN_PROGRESS", "OVERDUE"] },
      OR: [
        { assignedUser: { soldier: { telegramChatId: chatId } } },
        { holder: { users: { some: { soldier: { telegramChatId: chatId } } } } },
      ],
    },
    include: {
      holder: { select: { name: true } },
      plan: { select: { name: true } },
    },
    orderBy: { scheduledAt: "asc" },
    take: 10,
  });

  if (tasks.length === 0) {
    await sendTelegramMessage(token, chatId, `📊 <b>ספירות מלאי — ${soldier.fullName}</b>\n\n✅ אין משימות ספירה פתוחות כרגע.`);
    return;
  }

  const lines: string[] = [];
  lines.push(`📊 <b>ספירות מלאי — ${soldier.fullName}</b>`);
  lines.push(`נמצאו <b>${tasks.length}</b> משימות פתוחות:\n`);

  const buttons: { text: string; callback_data: string }[][] = [];
  for (const t of tasks) {
    const status = t.status === "OVERDUE" ? "⏰ באיחור" : t.status === "IN_PROGRESS" ? "🔄 בביצוע" : "🔵 פתוח";
    const due = t.dueAt.toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    lines.push(`${status} <b>${t.plan?.name ?? "ספירה"}</b>`);
    lines.push(`   📍 ${t.holder.name} · עד: ${due}`);
    lines.push(`   👉 <a href="${baseUrl}/counts/share/${t.shareToken}">לביצוע הספירה</a>`);
    lines.push("");
    if (!t.sessionId) {
      buttons.push([{ text: `🔄 האצל: ${t.holder.name}`, callback_data: `delegate:${t.id}` }]);
    }
  }

  const keyboard = buttons.length > 0 ? { inline_keyboard: buttons } : undefined;
  await sendTelegramMessage(token, chatId, lines.join("\n"), keyboard);
}

async function handlePhotoUpload(
  botToken: string,
  chatId: string,
  photos: { file_id: string; file_size?: number; width: number; height: number }[],
  battalionId: string,
) {
  const soldier = await prisma.soldier.findFirst({
    where: { battalionId, telegramChatId: chatId },
    select: { id: true, fullName: true, armoryTestProofAt: true },
  });
  if (!soldier) {
    await sendTelegramMessage(botToken, chatId, NOT_REGISTERED);
    return;
  }

  // אם החייל בחר לשלוח צילום רישיון — התמונה נשמרת לשדה שנבחר (עוקף את מבחן הארמון)
  const photoReq = await prisma.telegramPhotoRequest.findUnique({ where: { battalionId_chatId: { battalionId, chatId } } });
  if (photoReq && ["civFront", "civBack", "milFront"].includes(photoReq.target)) {
    const largest = photos[photos.length - 1];
    try {
      const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_id: largest.file_id }) });
      const fileData = await fileRes.json();
      if (!fileData.ok || !fileData.result?.file_path) { await sendTelegramMessage(botToken, chatId, "❌ שגיאה בטעינת התמונה. נסה שוב."); return; }
      const imgRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`);
      const imgBuf = Buffer.from(await imgRes.arrayBuffer());
      const ext = fileData.result.file_path.split(".").pop()?.toLowerCase() ?? "jpg";
      const dataUrl = `data:${ext === "png" ? "image/png" : "image/jpeg"};base64,${imgBuf.toString("base64")}`;
      const field = photoReq.target === "civFront" ? "civilianLicenseFrontData" : photoReq.target === "civBack" ? "civilianLicenseBackData" : "militaryLicenseFrontData";
      await prisma.soldier.update({ where: { id: soldier.id }, data: { [field]: dataUrl } });
      await prisma.telegramPhotoRequest.delete({ where: { battalionId_chatId: { battalionId, chatId } } }).catch(() => {});
      const label = photoReq.target === "civFront" ? "רישיון אזרחי — קדימה" : photoReq.target === "civBack" ? "רישיון אזרחי — אחורה" : "רישיון צבאי — קדימה";
      // מחזירים מיד את כפתורי הבחירה כדי שלא יצטרך לגלול לצילום הבא
      await sendTelegramMessage(botToken, chatId, `✅ <b>${label} נשמר!</b>\n\n📸 לצילום נוסף — בחר/י סוג ושלח/י תמונה:`, LICENSE_PHOTO_KEYBOARD);
    } catch (e) { console.error("[Telegram license photo]", e); await sendTelegramMessage(botToken, chatId, "❌ שגיאה בשמירת התמונה. נסה שוב."); }
    return;
  }

  if (soldier.armoryTestProofAt) {
    await sendTelegramMessage(botToken, chatId,
      `✅ כבר הועלה צילום מסך מבחן ארמון (${fmtDate(soldier.armoryTestProofAt)}).\nאם צריך לעדכן — פנה למפקד.`);
    return;
  }

  const largest = photos[photos.length - 1];
  try {
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: largest.file_id }),
    });
    const fileData = await fileRes.json();
    if (!fileData.ok || !fileData.result?.file_path) {
      await sendTelegramMessage(botToken, chatId, "❌ שגיאה בטעינת התמונה. נסה שוב.");
      return;
    }

    const imgRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`);
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());

    const ext = fileData.result.file_path.split(".").pop()?.toLowerCase() ?? "jpg";
    const mime = ext === "png" ? "image/png" : "image/jpeg";
    const dataUrl = `data:${mime};base64,${imgBuf.toString("base64")}`;

    await prisma.soldier.update({
      where: { id: soldier.id },
      data: { armoryTestProofImage: dataUrl, armoryTestProofAt: new Date() },
    });

    await sendTelegramMessage(botToken, chatId,
      `✅ <b>צילום מסך מבחן ארמון נשמר!</b>\n\n${soldier.fullName} — שלב מבחן נוהל ארמון הושלם.\nלחץ <b>📋 טפסים להחתמה</b> לצפייה בסטטוס.`, MAIN_KEYBOARD);
  } catch (e) {
    console.error("[Telegram photo upload]", e);
    await sendTelegramMessage(botToken, chatId, "❌ שגיאה בשמירת התמונה. נסה שוב.");
  }
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
}
