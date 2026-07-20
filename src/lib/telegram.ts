import { decryptSecret } from "./crypto";
import { prisma } from "./prisma";

/**
 * 📵 סינון דיוור — נקודת אכיפה אחת לכל 120+ מסלולי השליחה במערכת.
 *
 * "BULK" = דיוור יזום שאינו מחייב את הנמען אישית (ברודקאסט נוהל, תזכורות,
 * הודעות מערכת). חייל שביקש להפסיק — לא יקבל.
 * "OPERATIONAL" (ברירת המחדל) = הודעה אישית שהוא נדרש לה: בקשת חתימה,
 * זיכוי ציוד, אימות ספירה, קוד כניסה. נשלחת תמיד, כי אי-קבלתה פוגעת בו.
 *
 * ברירת המחדל היא OPERATIONAL בכוונה — כך קריאה קיימת שלא עודכנה לא
 * משתנה בהתנהגות, והחמרה נעשית רק במקומות שסומנו מפורשות.
 */
export type MessageKind = "OPERATIONAL" | "BULK";

/** מחזיר את קבוצת ה-chatId שסירבו לדיוור, מתוך רשימה נתונה. */
async function optedOutChatIds(chatIds: string[]): Promise<Set<string>> {
  if (chatIds.length === 0) return new Set();
  try {
    const rows = await prisma.soldier.findMany({
      where: { telegramChatId: { in: chatIds }, botOptOutAt: { not: null } },
      select: { telegramChatId: true },
    });
    return new Set(rows.map((r) => r.telegramChatId!).filter(Boolean));
  } catch {
    // כשל בבדיקה לא יחסום הודעה תפעולית — פותחים בהצלחה ולא בכישלון
    return new Set();
  }
}

/** נספח שמסביר לנמען איך להפסיק — חובה על כל דיוור יזום. */
export const OPT_OUT_FOOTER = [
  "",
  "—",
  "להפסקת הודעות מסוג זה שלחו לבוט: /stop",
].join("\n");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * קריאת Telegram API עמידה — מטפלת ב-429 (flood, לפי retry_after), 5xx ותקלות רשת
 * עם backoff. שגיאות 4xx אחרות (chat_id שגוי, המשתמש חסם את הבוט) קבועות — לא חוזרים עליהן.
 * זהו הבסיס לכל שליחה: הופך "הודעה נופלת בשקט" ל-מסירה אמינה גם תחת עומס של אלפי חיילים.
 */
async function telegramRequest(
  botToken: string,
  method: string,
  init: RequestInit,
  retries = 3,
  timeoutMs = 8000,
): Promise<unknown> {
  // 🔐 הטוקן נשמר מוצפן ב-rest — מפענחים כאן, בנקודת-החנק היחידה של כל קריאות ה-API.
  //    ערך legacy בטקסט גלוי מוחזר כמו-שהוא (decryptSecret עם fallback).
  const token = decryptSecret(botToken);
  let attempt = 0;
  for (;;) {
    let res: Response;
    // timeout לכל ניסיון — קריאה תקועה של Telegram לא תחזיק את הבקשה/הקרון ללא הגבלה
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { ...init, signal: controller.signal });
    } catch (e) {
      if (attempt++ >= retries) throw e; // תקלת רשת / timeout — retry עד המכסה
      await sleep(Math.min(500 * 2 ** attempt, 8000));
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) return res.json();

    if (res.status === 429) {
      // flood control — Telegram מחזיר retry_after (שניות). ממתינים בדיוק כמה שנדרש.
      const body = (await res.json().catch(() => null)) as { parameters?: { retry_after?: number } } | null;
      const retryAfter = body?.parameters?.retry_after ?? 1;
      if (attempt++ >= retries) throw new Error(`Telegram 429 — retry exhausted after ${retryAfter}s`);
      await sleep((retryAfter + 0.5) * 1000);
      continue;
    }
    if (res.status >= 500) {
      if (attempt++ >= retries) throw new Error(`Telegram ${res.status} — server error, retry exhausted`);
      await sleep(Math.min(500 * 2 ** attempt, 8000));
      continue;
    }
    // 4xx קבוע (chat_id שגוי / הבוט חסום) — אין טעם לחזור
    const err = await res.text().catch(() => "");
    throw new Error(`Telegram API error ${res.status}: ${err}`);
  }
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  replyMarkup?: object,
  kind: MessageKind = "OPERATIONAL",
) {
  if (kind === "BULK") {
    const blocked = await optedOutChatIds([chatId]);
    if (blocked.has(chatId)) return { ok: true, skipped: "opted-out" };
    text += OPT_OUT_FOOTER;
  }
  return telegramRequest(botToken, "sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
}

export type BulkMessage = { chatId: string; text: string; replyMarkup?: object };

/**
 * שליחה מרוכזת עם bounded concurrency ו-rate-limit (ברירת מחדל 25 הודעות/שנייה — מתחת
 * לתקרת ה-flood של Telegram, ~30/שנייה לבוט). מיועד לברודקאסטים גדולים (אימות ספירה
 * לכל הפלוגה, תזכורות) כדי שלא ייחתכו ב-maxDuration ולא יופלו ע"י flood control.
 *
 * מחזיר results[] מיושר לסדר הקלט (true=נשלח) — כדי שאפשר לסמן sentAt רק למי שנמסר בפועל.
 */
export async function sendTelegramBulk(
  botToken: string,
  messages: BulkMessage[],
  opts: { ratePerSec?: number; concurrency?: number; kind?: MessageKind } = {},
): Promise<{ sent: number; failed: number; results: boolean[] }> {
  // 📵 סינון מסרבי-דיוור. results[] נשאר מיושר לקלט: מסורב מסומן false ולכן
  //    לא יסומן כ"נשלח" ע"י הקורא, ולא תיווצר לו רשומת מסירה.
  let skipped = new Set<string>();
  if (opts.kind === "BULK") {
    skipped = await optedOutChatIds([...new Set(messages.map((m) => m.chatId))]);
    messages = messages.map((m) => (skipped.has(m.chatId) ? m : { ...m, text: m.text + OPT_OUT_FOOTER }));
  }
  const minGapMs = Math.ceil(1000 / (opts.ratePerSec ?? 25));
  const concurrency = Math.min(opts.concurrency ?? 8, messages.length || 1);
  const results = new Array<boolean>(messages.length).fill(false);
  let sent = 0;
  let failed = 0;
  let cursor = 0;
  let nextSlot = Date.now();

  // שער-קצב: כל שולח מזמין "חלון" ריק אטומית (JS חד-חוטי) ואז ממתין עד שיגיע.
  async function gate() {
    const now = Date.now();
    const slot = Math.max(now, nextSlot);
    nextSlot = slot + minGapMs;
    const wait = slot - now;
    if (wait > 0) await sleep(wait);
  }

  async function worker() {
    while (cursor < messages.length) {
      const i = cursor++;
      const m = messages[i];
      if (skipped.has(m.chatId)) continue; // מסרב דיוור — לא נשלח, לא נספר
      await gate();
      try {
        // ה-footer כבר נוסף למעלה; שולחים כ-OPERATIONAL כדי לא לבדוק שוב פר-הודעה
        await sendTelegramMessage(botToken, m.chatId, m.text, m.replyMarkup);
        results[i] = true;
        sent++;
      } catch {
        failed++; // עמיד — הודעה בודדת שנכשלה לא מפילה את הברודקאסט
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { sent, failed, results };
}

export async function sendTelegramDocument(
  botToken: string,
  chatId: string,
  fileBuffer: Buffer | Uint8Array,
  filename: string,
  caption?: string,
) {
  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("document", new Blob([new Uint8Array(fileBuffer)], { type: "application/pdf" }), filename);
  if (caption) {
    formData.append("caption", caption);
    formData.append("parse_mode", "HTML");
  }
  return telegramRequest(botToken, "sendDocument", { method: "POST", body: formData });
}

export async function answerCallbackQuery(botToken: string, callbackQueryId: string, text?: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

export async function editMessageText(
  botToken: string,
  chatId: string,
  messageId: number,
  text: string,
  replyMarkup?: object,
) {
  await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
}

/**
 * תפריט דינמי — קומפקטי (ללא כפתור עזרה; ההסבר נשלח ברישום).
 * "דיווחי כ"א וספירות" מוצג רק אם יש משהו לעשות (ספירה פתוחה או הרשאת דיווח כ"א).
 * מינוי צוות בוטל — נעשה רק דרך המערכת.
 */
export function buildMainKeyboard(showTasks = false, tasksPending = false, isDriver = false) {
  void isDriver; // אפשרויות הרכב אוחדו תחת תפריט "🚗 רכבים"
  const rows: { text: string }[][] = [
    [{ text: "🔫 נשקייה" }, { text: "📦 הציוד שלי" }],
  ];
  // "📋 משימות" — ספירות / דיווח כ"א / תעודות לחתימה. 🔴 = יש פעולה שממתינה למשתמש.
  if (showTasks) rows.push([{ text: tasksPending ? "📋 משימות 🔴" : "📋 משימות" }, { text: "🚗 רכבים" }]);
  else rows.push([{ text: "🚗 רכבים" }]);
  rows.push([{ text: "🕐 ארוחות ותפילות" }, { text: "🍽️ עדכון מזון" }]);
  return { keyboard: rows, resize_keyboard: true, is_persistent: true };
}

/** תת-תפריט "משימות" — ספירות · דיווח כ"א · תעודות לחתימה. */
export function buildTasksKeyboard(canAttendance = false) {
  const rows: { text: string }[][] = [[{ text: "📊 ספירות מלאי" }]];
  if (canAttendance) rows.push([{ text: "🗓️ דיווח כ\"א (דוח 1)" }]);
  rows.push([{ text: "📝 תעודות לחתימה" }, { text: "🗓️ התורנויות שלי" }]);
  rows.push([{ text: "⬅️ חזרה לתפריט" }]);
  return { keyboard: rows, resize_keyboard: true, is_persistent: true };
}

/** תפריט בוט חטיבה — רק לאנשי יחידת חטיבה (מלכ"א / בעלי-תפקיד). */
export function buildBrigadeKeyboard() {
  return { keyboard: [[{ text: "📥 דרישות נכנסות" }], [{ text: "❓ עזרה" }]], resize_keyboard: true, is_persistent: true };
}

/** תת-תפריט רכבים — כל האפשרויות תחת "🚗 רכבים" (זמינות לכולם). */
export function buildVehicleKeyboard(_canManageTeam = false, _isDriver = false) {
  void _canManageTeam; void _isDriver;
  const rows: { text: string }[][] = [
    [{ text: "🚗 משימות ושבצ\"ק" }],
    [{ text: "📁 תיק נהג" }, { text: "🪪 בדיקת הסמכות" }],
    [{ text: "⛽ כרטיסי הדלק שלי" }, { text: "🚧 דיווח תאונה" }],
    [{ text: "⬅️ חזרה לתפריט" }],
  ];
  return { keyboard: rows, resize_keyboard: true, is_persistent: true };
}

export const MAIN_KEYBOARD = buildMainKeyboard(true);
