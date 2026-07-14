import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { DEFAULT_RULES } from "@/lib/botNotifications";
import { escapeTelegram } from "@/lib/escape-html";

/** תזכורת טיפולי רכב — נשלחת יום (או N ימים) לפני מועד הטיפול. מופעלת מהקרון היומי. */
export async function processMaintenanceReminders(): Promise<{ battalions: number; sent: number }> {
  const battalions = await prisma.battalion.findMany({
    where: { telegramBotToken: { not: null } },
    select: { id: true, telegramBotToken: true },
  });
  const def = DEFAULT_RULES.find((r) => r.key === "maintenance-reminder")!;
  const todayIL = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  let sent = 0;

  for (const b of battalions) {
    const token = b.telegramBotToken!;
    const rule = await prisma.botNotificationRule.findUnique({ where: { battalionId_key: { battalionId: b.id, key: "maintenance-reminder" } } });
    if (rule && !rule.enabled) continue;
    const daysBefore = rule?.daysBefore ?? def.daysBefore;
    const recipients = (rule?.recipients ?? def.recipients).split(",").map((s) => s.trim()).filter(Boolean);

    const target = new Date(todayIL + "T00:00:00.000Z");
    target.setUTCDate(target.getUTCDate() + daysBefore);
    const targetEnd = new Date(target); targetEnd.setUTCDate(targetEnd.getUTCDate() + 1);

    const maints = await prisma.vehicleMaintenance.findMany({
      where: { battalionId: b.id, nextDate: { gte: target, lt: targetEnd } },
      include: { vehicleSerialUnit: { select: { serialNumber: true, itemType: { select: { name: true } }, signedSoldier: { select: { fullName: true, telegramChatId: true } } } } },
    });
    const due = maints.filter((m) => !m.reminderSentFor || m.reminderSentFor.getTime() !== target.getTime());
    if (due.length === 0) continue;
    const dateLabel = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short" }).format(target);

    // קצין רכב — הודעת סיכום עם כל הרכבים
    if (recipients.includes("vehicle-officer")) {
      const officers = await prisma.appUser.findMany({
        where: { battalionId: b.id, role: "WAREHOUSE_MANAGER", active: true, holder: { warehouseType: "VEHICLES" } },
        select: { soldier: { select: { telegramChatId: true } } },
      });
      const lines = due.map((m, i) => {
        const v = m.vehicleSerialUnit;
        return `${i + 1}. ${escapeTelegram(v.itemType.name)} · ${escapeTelegram(v.serialNumber)}${m.serviceType ? ` — ${escapeTelegram(m.serviceType)}` : ""}${m.location ? ` @ ${escapeTelegram(m.location)}` : ""}${m.hours ? ` (${escapeTelegram(String(m.hours))})` : ""}${m.contactName ? ` · ${escapeTelegram(m.contactName)}${m.contactPhone ? " " + escapeTelegram(m.contactPhone) : ""}` : ""}`;
      });
      const text = `🔧 <b>תזכורת טיפולים — ${dateLabel}</b>\n${due.length} רכבים לטיפול:\n\n${lines.join("\n")}`;
      const seen = new Set<string>();
      for (const o of officers) {
        const chat = o.soldier?.telegramChatId;
        if (chat && !seen.has(chat)) { seen.add(chat); await sendTelegramMessage(token, chat, text).catch(() => {}); sent++; }
      }
    }

    // חייל חתום — כל אחד על הרכב שלו
    if (recipients.includes("signed-holder")) {
      for (const m of due) {
        const v = m.vehicleSerialUnit;
        const chat = v.signedSoldier?.telegramChatId;
        if (!chat) continue;
        const parts = [`🔧 <b>תזכורת טיפול רכב — ${dateLabel}</b>`, `לרכב שחתום עליך יש טיפול מתקרב:`, `🚙 ${escapeTelegram(v.itemType.name)} · ${escapeTelegram(v.serialNumber)}`];
        if (m.serviceType) parts.push(`סוג: ${escapeTelegram(m.serviceType)}`);
        if (m.location) parts.push(`📍 ${escapeTelegram(m.location)}`);
        if (m.hours) parts.push(`🕐 ${m.hours}`);
        if (m.contactName) parts.push(`☎️ ${escapeTelegram(m.contactName)}${m.contactPhone ? " " + escapeTelegram(m.contactPhone) : ""}`);
        await sendTelegramMessage(token, chat, parts.join("\n")).catch(() => {});
        sent++;
      }
    }

    await prisma.vehicleMaintenance.updateMany({ where: { id: { in: due.map((m) => m.id) } }, data: { reminderSentFor: target } });
  }
  return { battalions: battalions.length, sent };
}
