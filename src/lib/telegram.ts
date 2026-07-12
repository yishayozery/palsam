export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  replyMarkup?: object,
) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram API error: ${err}`);
  }
  return res.json();
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
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram sendDocument error: ${err}`);
  }
  return res.json();
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
  rows.push([{ text: "🕐 ארוחות ותפילות" }]);
  return { keyboard: rows, resize_keyboard: true, is_persistent: true };
}

/** תת-תפריט "משימות" — ספירות · דיווח כ"א · תעודות לחתימה. */
export function buildTasksKeyboard(canAttendance = false) {
  const rows: { text: string }[][] = [[{ text: "📊 ספירות מלאי" }]];
  if (canAttendance) rows.push([{ text: "🗓️ דיווח כ\"א (דוח 1)" }]);
  rows.push([{ text: "📝 תעודות לחתימה" }]);
  rows.push([{ text: "⬅️ חזרה לתפריט" }]);
  return { keyboard: rows, resize_keyboard: true, is_persistent: true };
}

/** תת-תפריט רכבים — כל האפשרויות תחת "🚗 רכבים" (זמינות לכולם). */
export function buildVehicleKeyboard(_canManageTeam = false, _isDriver = false) {
  void _canManageTeam; void _isDriver;
  const rows: { text: string }[][] = [
    [{ text: "🚗 משימות ושבצ\"ק" }],
    [{ text: "📁 תיק נהג" }, { text: "🪪 בדיקת הסמכות" }],
    [{ text: "⛽ כרטיסי הדלק שלי" }],
    [{ text: "⬅️ חזרה לתפריט" }],
  ];
  return { keyboard: rows, resize_keyboard: true, is_persistent: true };
}

export const MAIN_KEYBOARD = buildMainKeyboard(true);
