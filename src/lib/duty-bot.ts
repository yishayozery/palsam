// לוגיקת בוט לתורנויות (פאזה 2): "התורנויות שלי", בקשת החלפה, ושיבוץ עצמי.
// כל פונקציה מקבלת botToken (מוצפן — sendTelegramMessage מפענח פנימית) + chatId + soldierId מאומת (נטען ב-route לפי chatId).
import { prisma } from "./prisma";
import { sendTelegramMessage, answerCallbackQuery, editMessageText } from "./telegram";
import { escapeTelegram } from "./escape-html";
import type { Prisma } from "@/generated/prisma";

function fmtWhen(date: Date, start: string | null, end: string | null): string {
  const d = new Date(date).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "short", day: "2-digit", month: "2-digit" });
  return `${d}${start ? ` ${start}${end ? `-${end}` : ""}` : ""}`;
}

type SlotScope = { companyId: string | null; squadId: string | null };
/** בריכת חיילים זכאים למשבצת — לפי מחלקה/פלוגה של המשבצת (או כל הגדוד אם לא הוגדר). */
async function eligiblePool(slot: SlotScope, battalionId: string): Promise<Set<string>> {
  const where: Prisma.SoldierWhereInput = { battalionId, status: { notIn: ["DISCHARGED", "INACTIVE"] } };
  if (slot.squadId) where.squadId = slot.squadId;
  else if (slot.companyId) where.companyId = slot.companyId;
  const pool = await prisma.soldier.findMany({ where, select: { id: true } });
  return new Set(pool.map((p) => p.id));
}

function todayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** 🗓️ "התורנויות שלי" — תורנויות קרובות (עם כפתור בקשת החלפה) + משבצות פנויות לשיבוץ עצמי. */
export async function handleMyDuty(botToken: string, chatId: string, soldierId: string, battalionId: string) {
  const today = todayUtc();
  const mine = await prisma.dutyAssignment.findMany({
    where: { soldierId, slot: { date: { gte: today }, board: { battalionId, active: true } } },
    select: { id: true, slot: { select: { id: true, date: true, startTime: true, endTime: true, label: true, board: { select: { name: true } } } } },
    orderBy: { slot: { date: "asc" } }, take: 20,
  });

  if (mine.length === 0) {
    await sendTelegramMessage(botToken, chatId, "🗓️ <b>התורנויות שלי</b>\n\nאין לך תורנויות קרובות.");
  } else {
    await sendTelegramMessage(botToken, chatId, `🗓️ <b>התורנויות שלי (${mine.length})</b>`);
    for (const a of mine) {
      const s = a.slot;
      const openSwap = await prisma.dutySwapRequest.findFirst({ where: { assignmentId: a.id, status: "OPEN" }, select: { id: true } });
      const btn = openSwap
        ? [{ text: "⏳ ממתין למחליף — בטל בקשה", callback_data: `dutyswap:cancel:${openSwap.id}` }]
        : [{ text: "🔄 בקש החלפה", callback_data: `dutyswap:req:${a.id}` }];
      await sendTelegramMessage(botToken, chatId,
        `• <b>${escapeTelegram(s.board.name)}</b>\n📅 ${fmtWhen(s.date, s.startTime, s.endTime)}${s.label ? `\n📍 ${escapeTelegram(s.label)}` : ""}`,
        { inline_keyboard: [btn] });
    }
  }

  // 🙋 משבצות פנויות לשיבוץ עצמי (בלוחות שאופשר בהם)
  const me = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { companyId: true, squadId: true } });
  const openSlots = await prisma.dutySlot.findMany({
    where: {
      date: { gte: today },
      board: { battalionId, active: true, allowSelfSchedule: true },
      OR: [
        { squadId: me?.squadId ?? "__none__" },
        { squadId: null, companyId: me?.companyId ?? "__none__" },
        { squadId: null, companyId: null },
      ],
    },
    select: { id: true, date: true, startTime: true, endTime: true, label: true, capacity: true, board: { select: { name: true } }, assignments: { select: { soldierId: true } } },
    orderBy: { date: "asc" }, take: 20,
  });
  const available = openSlots.filter((s) => s.assignments.length < s.capacity && !s.assignments.some((x) => x.soldierId === soldierId));
  if (available.length) {
    const buttons = available.map((s) => [{ text: `${fmtWhen(s.date, s.startTime, s.endTime)}${s.label ? " · " + s.label : ""} — ${s.board.name}`, callback_data: `dutyself:${s.id}` }]);
    await sendTelegramMessage(botToken, chatId, "🙋 <b>משבצות פנויות לשיבוץ עצמי:</b>", { inline_keyboard: buttons });
  }
}

/** 🔄 חייל מבקש מחליף למשבצת שלו — יוצר בקשה ומודיע לכל הזכאים המחוברים. */
export async function handleSwapRequest(botToken: string, chatId: string, soldierId: string, battalionId: string, assignmentId: string, messageId: number, cbId: string) {
  const a = await prisma.dutyAssignment.findFirst({
    where: { id: assignmentId, soldierId, slot: { board: { battalionId } } },
    select: { id: true, slot: { select: { id: true, date: true, startTime: true, endTime: true, label: true, companyId: true, squadId: true, board: { select: { name: true } }, assignments: { select: { soldierId: true } } } } },
  });
  if (!a) { await answerCallbackQuery(botToken, cbId, "לא נמצא / לא שלך"); return; }
  const s = a.slot;
  const swap = (await prisma.dutySwapRequest.findFirst({ where: { assignmentId, status: "OPEN" }, select: { id: true } }))
    ?? (await prisma.dutySwapRequest.create({ data: { battalionId, assignmentId, slotId: s.id, requesterSoldierId: soldierId, status: "OPEN" }, select: { id: true } }));

  const pool = await eligiblePool(s, battalionId);
  const assignedHere = new Set(s.assignments.map((x) => x.soldierId));
  const requester = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { fullName: true } });
  const targets = await prisma.soldier.findMany({
    where: { id: { in: [...pool] }, telegramChatId: { not: null }, NOT: { id: soldierId } },
    select: { id: true, telegramChatId: true },
  });
  const when = fmtWhen(s.date, s.startTime, s.endTime);
  let notified = 0;
  for (const t of targets) {
    if (assignedHere.has(t.id) || !t.telegramChatId) continue;
    await sendTelegramMessage(botToken, t.telegramChatId,
      `🔄 <b>בקשת החלפה בתורנות</b>\n${escapeTelegram(requester?.fullName ?? "חייל")} מחפש/ת מחליף/ה:\n🗓️ ${escapeTelegram(s.board.name)}\n📅 ${when}${s.label ? `\n📍 ${escapeTelegram(s.label)}` : ""}`,
      { inline_keyboard: [[{ text: "🙋 אני מחליף/ה", callback_data: `dutyswap:take:${swap.id}` }]] }).catch(() => {});
    notified++;
  }
  await editMessageText(botToken, chatId, messageId,
    `🔄 <b>${escapeTelegram(s.board.name)}</b>\n📅 ${when}\n\n⏳ בקשת החלפה נשלחה ל-${notified} חיילים. תעודכן/י כשמישהו יקבל.`,
    { inline_keyboard: [[{ text: "❌ בטל בקשה", callback_data: `dutyswap:cancel:${swap.id}` }]] }).catch(() => {});
  await answerCallbackQuery(botToken, cbId, notified ? `נשלח ל-${notified} חיילים` : "אין מחליפים זמינים מחוברים לבוט");
}

/** 🙋 חייל מקבל בקשת החלפה — מעביר אליו את המשבצת. */
export async function handleSwapTake(botToken: string, chatId: string, soldierId: string, battalionId: string, swapId: string, messageId: number, cbId: string) {
  const swap = await prisma.dutySwapRequest.findFirst({ where: { id: swapId, battalionId, status: "OPEN" }, select: { id: true, assignmentId: true, slotId: true, requesterSoldierId: true } });
  if (!swap) { await answerCallbackQuery(botToken, cbId, "הבקשה כבר טופלה"); await editMessageText(botToken, chatId, messageId, "ℹ️ הבקשה כבר טופלה או בוטלה.").catch(() => {}); return; }
  if (soldierId === swap.requesterSoldierId) { await answerCallbackQuery(botToken, cbId, "אי אפשר להחליף את עצמך"); return; }

  const slot = await prisma.dutySlot.findUnique({
    where: { id: swap.slotId },
    select: { id: true, date: true, startTime: true, endTime: true, label: true, capacity: true, companyId: true, squadId: true, board: { select: { name: true, battalionId: true } }, assignments: { select: { soldierId: true } } },
  });
  if (!slot || slot.board.battalionId !== battalionId) { await answerCallbackQuery(botToken, cbId, "המשבצת לא נמצאה"); return; }
  const pool = await eligiblePool(slot, battalionId);
  if (!pool.has(soldierId)) { await answerCallbackQuery(botToken, cbId, "אינך זכאי למשבצת זו"); return; }
  if (slot.assignments.some((x) => x.soldierId === soldierId)) { await answerCallbackQuery(botToken, cbId, "כבר משובץ/ת במשבצת"); return; }

  // החלפה אטומית: מסירים את שיבוץ המבקש, מוסיפים את המקבל, מסמנים את הבקשה כטופלה
  await prisma.$transaction(async (tx) => {
    await tx.dutyAssignment.deleteMany({ where: { id: swap.assignmentId } });
    await tx.dutyAssignment.upsert({ where: { slotId_soldierId: { slotId: slot.id, soldierId } }, update: {}, create: { slotId: slot.id, soldierId, assignedByName: "החלפה בבוט" } });
    await tx.dutySwapRequest.update({ where: { id: swap.id }, data: { status: "TAKEN", takenBySoldierId: soldierId, resolvedAt: new Date() } });
  });

  const [acceptor, requester] = await Promise.all([
    prisma.soldier.findUnique({ where: { id: soldierId }, select: { fullName: true } }),
    prisma.soldier.findUnique({ where: { id: swap.requesterSoldierId }, select: { fullName: true, telegramChatId: true } }),
  ]);
  const when = fmtWhen(slot.date, slot.startTime, slot.endTime);
  await editMessageText(botToken, chatId, messageId, `✅ קיבלת את התורנות — <b>${escapeTelegram(slot.board.name)}</b>\n📅 ${when}${slot.label ? `\n📍 ${escapeTelegram(slot.label)}` : ""}\nתודה! 🙏`).catch(() => {});
  await answerCallbackQuery(botToken, cbId, "שובצת ✅");
  if (requester?.telegramChatId) {
    await sendTelegramMessage(botToken, requester.telegramChatId,
      `✅ <b>נמצא מחליף!</b>\n${escapeTelegram(acceptor?.fullName ?? "חייל")} מחליף/ה אותך בתורנות <b>${escapeTelegram(slot.board.name)}</b> (${when}).`).catch(() => {});
  }
}

/** ❌ המבקש מבטל בקשת החלפה פתוחה. */
export async function handleSwapCancel(botToken: string, chatId: string, soldierId: string, battalionId: string, swapId: string, messageId: number, cbId: string) {
  const swap = await prisma.dutySwapRequest.findFirst({ where: { id: swapId, battalionId, status: "OPEN", requesterSoldierId: soldierId }, select: { id: true } });
  if (!swap) { await answerCallbackQuery(botToken, cbId, "לא נמצא / כבר טופל"); return; }
  await prisma.dutySwapRequest.update({ where: { id: swap.id }, data: { status: "CANCELED", resolvedAt: new Date() } });
  await editMessageText(botToken, chatId, messageId, "❌ בקשת ההחלפה בוטלה. התורנות עדיין עליך.").catch(() => {});
  await answerCallbackQuery(botToken, cbId, "הבקשה בוטלה");
}

/** 🙋 שיבוץ עצמי — חייל משבץ עצמו למשבצת פנויה (בלוח שאופשר בו). */
export async function handleSelfSchedule(botToken: string, chatId: string, soldierId: string, battalionId: string, slotId: string, messageId: number, cbId: string) {
  const slot = await prisma.dutySlot.findFirst({
    where: { id: slotId, board: { battalionId, active: true, allowSelfSchedule: true } },
    select: { id: true, date: true, startTime: true, endTime: true, label: true, capacity: true, companyId: true, squadId: true, board: { select: { name: true } }, assignments: { select: { soldierId: true } } },
  });
  if (!slot) { await answerCallbackQuery(botToken, cbId, "המשבצת לא זמינה לשיבוץ עצמי"); return; }
  const pool = await eligiblePool(slot, battalionId);
  if (!pool.has(soldierId)) { await answerCallbackQuery(botToken, cbId, "אינך זכאי למשבצת זו"); return; }
  if (slot.assignments.some((x) => x.soldierId === soldierId)) { await answerCallbackQuery(botToken, cbId, "כבר משובץ/ת"); return; }
  if (slot.assignments.length >= slot.capacity) { await answerCallbackQuery(botToken, cbId, "המשבצת כבר מלאה"); return; }

  await prisma.dutyAssignment.upsert({ where: { slotId_soldierId: { slotId: slot.id, soldierId } }, update: {}, create: { slotId: slot.id, soldierId, assignedByName: "שיבוץ עצמי" } });
  const when = fmtWhen(slot.date, slot.startTime, slot.endTime);
  await editMessageText(botToken, chatId, messageId, `✅ שובצת בהצלחה — <b>${escapeTelegram(slot.board.name)}</b>\n📅 ${when}${slot.label ? `\n📍 ${escapeTelegram(slot.label)}` : ""}`).catch(() => {});
  await answerCallbackQuery(botToken, cbId, "שובצת ✅");
}
