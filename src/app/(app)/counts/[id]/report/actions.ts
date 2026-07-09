"use server";

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";

/** שליחה חוזרת של קישור האימות לכל חייל בסשן שטרם דיווח (ומחובר לבוט). */
export async function resendIncomplete(sessionId: string) {
  const user = await requireCapability("counts.execute");
  const bId = user.battalionId!;
  const session = await prisma.countSession.findUnique({ where: { id: sessionId }, select: { battalionId: true, isBlind: true } });
  if (!session || session.battalionId !== bId) return { error: "סשן לא נמצא" };

  const battalion = await prisma.battalion.findUnique({ where: { id: bId }, select: { telegramBotToken: true, name: true } });
  if (!battalion?.telegramBotToken) return { error: "לגדוד אין בוט" };

  const pending = await prisma.verificationRequest.findMany({
    where: { sessionId, respondedAt: null, soldier: { telegramChatId: { not: null } } },
    select: { token: true, soldier: { select: { fullName: true, telegramChatId: true } }, _count: { select: { items: true } } },
  });
  if (pending.length === 0) return { ok: true, sent: 0 };

  const { sendTelegramMessage } = await import("@/lib/telegram");
  const token = battalion.telegramBotToken;
  let sent = 0;
  for (let i = 0; i < pending.length; i += 20) {
    const batch = pending.slice(i, i + 20);
    const results = await Promise.allSettled(batch.map((v) => {
      const text = [
        `🔔 <b>תזכורת — ספירת ציוד ${battalion.name}</b>`, ``,
        `${v.soldier!.fullName}, טרם דיווחת על ${v._count.items} פריטים.`, ``,
        `👉 <a href="${BASE}/verify/${v.token}">לחץ כאן לדיווח</a>`,
      ].join("\n");
      return sendTelegramMessage(token, v.soldier!.telegramChatId!, text);
    }));
    sent += results.filter((r) => r.status === "fulfilled").length;
  }
  await audit(user.id, "COUNT_RESEND_INCOMPLETE", "CountSession", sessionId, { sent });
  return { ok: true, sent };
}

/** התראה למפקדי הפלוגות בסשן — סיכום מי טרם דיווח וכמה פערים בפלוגה. */
export async function alertCommanders(sessionId: string) {
  const user = await requireCapability("counts.execute");
  const bId = user.battalionId!;
  const session = await prisma.countSession.findUnique({ where: { id: sessionId }, select: { battalionId: true } });
  if (!session || session.battalionId !== bId) return { error: "סשן לא נמצא" };

  const battalion = await prisma.battalion.findUnique({ where: { id: bId }, select: { telegramBotToken: true, name: true } });
  if (!battalion?.telegramBotToken) return { error: "לגדוד אין בוט" };

  // בקשות האימות של הסשן, עם פלוגת החייל וסטטוס דיווח
  const reqs = await prisma.verificationRequest.findMany({
    where: { sessionId },
    select: { respondedAt: true, soldier: { select: { fullName: true, companyId: true } }, items: { select: { status: true } } },
  });
  // אגרגציה לפי פלוגה
  const byCompany = new Map<string, { notReported: string[]; gaps: number }>();
  for (const r of reqs) {
    const cId = r.soldier?.companyId;
    if (!cId) continue;
    const g = byCompany.get(cId) ?? { notReported: [], gaps: 0 };
    if (!r.respondedAt) g.notReported.push(r.soldier!.fullName);
    else g.gaps += r.items.filter((i) => i.status === "DENIED").length;
    byCompany.set(cId, g);
  }
  if (byCompany.size === 0) return { ok: true, sent: 0 };

  // מפקדי הפלוגות המחוברים לבוט
  const commanders = await prisma.soldier.findMany({
    where: { companyId: { in: [...byCompany.keys()] }, telegramChatId: { not: null }, companyRole: { isCommander: true }, status: { notIn: ["DISCHARGED", "INACTIVE"] } },
    select: { fullName: true, telegramChatId: true, companyId: true, company: { select: { name: true } } },
  });

  const { sendTelegramMessage } = await import("@/lib/telegram");
  let sent = 0;
  for (const c of commanders) {
    const g = byCompany.get(c.companyId!);
    if (!g) continue;
    const text = [
      `📊 <b>סיכום ספירה — ${c.company?.name ?? "פלוגה"}</b>`, ``,
      g.notReported.length > 0 ? `🔴 טרם דיווחו (${g.notReported.length}):` : `🟢 כולם דיווחו`,
      ...g.notReported.slice(0, 25).map((n) => `• ${n}`),
      ``,
      g.gaps > 0 ? `⚠️ ${g.gaps} פריטים דווחו כחסרים` : `✅ אין פערים מדווחים`,
    ].join("\n");
    const ok = await sendTelegramMessage(battalion.telegramBotToken, c.telegramChatId!, text).then(() => true).catch(() => false);
    if (ok) sent++;
  }
  await audit(user.id, "COUNT_ALERT_COMMANDERS", "CountSession", sessionId, { sent });
  return { ok: true, sent };
}
