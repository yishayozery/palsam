"use server";

import { prisma } from "@/lib/prisma";

export async function submitVerification(
  token: string,
  responses: {
    itemId: string;
    found: boolean;
    photoData?: string;
    note?: string;
    reportedSerial?: string;
    reportedLocation?: string;
    reportedQuantity?: number;
    reportedExpiry?: string;
  }[],
) {
  const req = await prisma.verificationRequest.findUnique({
    where: { token },
    select: {
      id: true, respondedAt: true, sessionId: true, battalionId: true, soldierId: true,
      session: { select: { signOnComplete: true, correctByReporter: true } },
    },
  });
  if (!req) return { error: "בקשה לא נמצאה" };
  // חסימת דיווח כפול — אלא אם הספירה מאפשרת תיקון ע"י המדווח בקצה
  if (req.respondedAt && !req.session?.correctByReporter) return { error: "כבר דווח" };

  // 1. עדכון תגובות החייל על ה-VerificationItem
  await prisma.$transaction(
    responses.map((r) =>
      prisma.verificationItem.update({
        where: { id: r.itemId },
        data: {
          status: r.found ? "CONFIRMED" : "DENIED",
          photoData: r.photoData || null,
          note: r.note || null,
          reportedSerial: r.reportedSerial || null,
          reportedLocation: r.reportedLocation || null,
          reportedQuantity: r.reportedQuantity ?? null,
          reportedExpiry: r.reportedExpiry ? new Date(r.reportedExpiry) : null,
          respondedAt: new Date(),
        },
      }),
    ),
  );

  // 2. 🔄 סנכרון חזרה לספירה — מעדכן CountLine.countedQty ויוצר Discrepancy לפערים,
  //    כדי שהדוח ומסך הפערים ישקפו את מה שהחייל דיווח בפועל.
  try {
    const items = await prisma.verificationItem.findMany({
      where: { requestId: req.id },
      select: { serialUnitId: true, itemTypeId: true, status: true, expectedQuantity: true, reportedQuantity: true },
    });
    const lines = await prisma.countLine.findMany({
      where: { sessionId: req.sessionId, ...(req.soldierId ? { soldierId: req.soldierId } : {}) },
      select: { id: true, itemTypeId: true, serialUnitId: true, holderId: true, expectedQty: true, countedQty: true },
    });

    const usedLineIds = new Set<string>();
    for (const it of items) {
      // התאמת שורת ספירה: סריאלי לפי serialUnitId, כמותי לפי itemTypeId (שורה שטרם שובצה בדיווח זה)
      const line = it.serialUnitId
        ? lines.find((l) => l.serialUnitId === it.serialUnitId)
        : lines.find((l) => l.itemTypeId === it.itemTypeId && !l.serialUnitId && !usedLineIds.has(l.id));
      if (!line) continue;
      usedLineIds.add(line.id);

      const expected = line.expectedQty;
      const counted = it.status === "CONFIRMED"
        ? (it.reportedQuantity ?? expected)   // נמצא — הכמות שדווחה או הצפויה
        : (it.reportedQuantity ?? 0);          // חסר — 0 (או כמות חלקית אם דווחה)

      await prisma.countLine.update({ where: { id: line.id }, data: { countedQty: counted } });
      line.countedQty = counted; // מונע התאמה כפולה של אותה שורה

      // מחיקת פער פתוח קודם לאותו פריט/מחזיק (אידמפוטנטי — תומך בתיקון/דיווח חוזר)
      await prisma.discrepancy.deleteMany({
        where: { sessionId: req.sessionId ?? undefined, itemTypeId: line.itemTypeId, holderId: line.holderId, status: "OPEN" },
      });
      const diff = counted - expected;
      if (diff !== 0) {
        await prisma.discrepancy.create({
          data: {
            battalionId: req.battalionId, sessionId: req.sessionId,
            itemTypeId: line.itemTypeId, holderId: line.holderId,
            expectedQty: expected, countedQty: counted, diff,
            kind: diff < 0 ? "LOSS" : "SURPLUS", status: "OPEN",
          },
        });
      }
    }
  } catch { /* סנכרון הוא best-effort — לא מפיל את הדיווח */ }

  // 3. ✍️ ספירת החתמה — הדיווח מחתים את החייל על הציוד הסריאלי שאישר (בלי תנועת מלאי)
  if (req.session?.signOnComplete && req.soldierId) {
    try {
      const confirmed = await prisma.verificationItem.findMany({
        where: { requestId: req.id, status: "CONFIRMED", serialUnitId: { not: null } },
        select: { serialUnitId: true },
      });
      const ids = confirmed.map((i) => i.serialUnitId!).filter(Boolean);
      if (ids.length > 0) {
        await prisma.serialUnit.updateMany({ where: { id: { in: ids } }, data: { signedSoldierId: req.soldierId } });
      }
    } catch { /* best-effort */ }
  }

  await prisma.verificationRequest.update({
    where: { id: req.id },
    data: { respondedAt: new Date() },
  });

  // 4. 📲 תשובת בוט למדווח — האם הדיווח תקין (הכל אושר) או שנמצאו פערים
  try {
    if (req.soldierId) {
      const [soldier, battalion, allItems] = await Promise.all([
        prisma.soldier.findUnique({ where: { id: req.soldierId }, select: { fullName: true, telegramChatId: true } }),
        prisma.battalion.findUnique({ where: { id: req.battalionId }, select: { telegramBotToken: true, name: true } }),
        prisma.verificationItem.findMany({ where: { requestId: req.id }, select: { status: true, itemTypeName: true, expectedQuantity: true, reportedQuantity: true } }),
      ]);
      if (soldier?.telegramChatId && battalion?.telegramBotToken) {
        const gaps = allItems.filter((it) => it.status === "DENIED" || (it.reportedQuantity != null && it.expectedQuantity != null && it.reportedQuantity < it.expectedQuantity));
        const { sendTelegramMessage } = await import("@/lib/telegram");
        const text = gaps.length === 0
          ? [`✅ <b>הדיווח שלך התקבל — הכל תקין</b>`, ``, `${soldier.fullName}, כל הפריטים אומתו. תודה!`].join("\n")
          : [`⚠️ <b>הדיווח שלך התקבל — נמצאו פערים</b>`, ``, `${soldier.fullName}, ${gaps.length} פריטים חסרים/שונים:`, ...gaps.slice(0, 10).map((g) => `• ${g.itemTypeName}`), ``, `הצוות המטפל יעודכן.`].join("\n");
        await sendTelegramMessage(battalion.telegramBotToken, soldier.telegramChatId, text).catch(() => {});
      }
    }
  } catch { /* תשובת בוט — best-effort, לא מפיל את הדיווח */ }

  return { ok: true };
}

/** האצלת דיווח — שולח את אותו קישור אימות לחייל אחר בפלוגה שימלא במקום המקורי. */
export async function delegateVerification(token: string, targetSoldierId: string) {
  const req = await prisma.verificationRequest.findUnique({
    where: { token },
    select: { id: true, battalionId: true, respondedAt: true, session: { select: { correctByReporter: true } }, soldier: { select: { fullName: true } } },
  });
  if (!req) return { error: "בקשה לא נמצאה" };
  if (req.respondedAt && !req.session?.correctByReporter) return { error: "כבר דווח" };

  const target = await prisma.soldier.findUnique({
    where: { id: targetSoldierId },
    select: { id: true, fullName: true, telegramChatId: true, battalionId: true },
  });
  if (!target || target.battalionId !== req.battalionId) return { error: "חייל לא נמצא" };
  if (!target.telegramChatId) return { error: "החייל אינו מחובר לבוט — לא ניתן לשלוח לו" };

  const battalion = await prisma.battalion.findUnique({ where: { id: req.battalionId }, select: { telegramBotToken: true, name: true } });
  if (!battalion?.telegramBotToken) return { error: "לגדוד אין בוט" };

  const { sendTelegramMessage } = await import("@/lib/telegram");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
  const link = `${baseUrl}/verify/${token}`;
  const text = [
    `📋 <b>הואצל אליך דיווח ספירה — ${battalion.name}</b>`, ``,
    `${target.fullName}, התבקשת לבצע ספירת ציוד בשם ${req.soldier?.fullName ?? "חייל"}.`, ``,
    `👉 <a href="${link}">לחץ כאן לדיווח</a>`,
  ].join("\n");
  await sendTelegramMessage(battalion.telegramBotToken, target.telegramChatId, text).catch(() => {});

  return { ok: true, name: target.fullName };
}
