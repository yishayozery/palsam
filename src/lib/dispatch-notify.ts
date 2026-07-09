import "server-only";
import { prisma } from "./prisma";

export const DEFAULT_TRIP_LINK = "https://share.google/ynXRw9qVmG2TNOk7u";

/** התראות בוט על יצירת משימה — לנהגים (כפתור הקמת הרשאה), קצין רכב, ומפקד המשימה. */
export async function notifyMissionCreated(missionId: string, bId: string): Promise<void> {
  try {
    const mission = await prisma.mission.findUnique({
      where: { id: missionId },
      include: {
        battalion: { select: { telegramBotToken: true, tripLink: true } },
        commanderSoldier: { select: { fullName: true, telegramChatId: true } },
        vehicles: {
          include: {
            vehicleSerialUnit: { select: { serialNumber: true, itemType: { select: { name: true } } } },
            soldiers: { include: { soldier: { select: { fullName: true, telegramChatId: true } } } },
          },
        },
      },
    });
    const token = mission?.battalion.telegramBotToken;
    if (!mission || !token) return;
    const link = mission.battalion.tripLink?.trim() || DEFAULT_TRIP_LINK;
    const dateStr = mission.missionDate.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" });
    const { sendTelegramMessage } = await import("@/lib/telegram");

    const vehicleLabel = (v: (typeof mission.vehicles)[number]) =>
      v.isExternal
        ? `${v.externalVehicleTypeName || "רכב חוץ"} ${v.externalVehicleNumber || ""}`.trim()
        : `${v.vehicleSerialUnit?.itemType.name || "רכב"} ${v.vehicleSerialUnit?.serialNumber || ""}`.trim();

    const driverLines: string[] = [];
    const officerButtons: { text: string; callback_data: string }[][] = [];
    for (const v of mission.vehicles) {
      const vName = vehicleLabel(v);
      for (const s of v.soldiers) {
        if (!s.isDriver) continue;
        const name = s.soldier?.fullName || s.externalName || "נהג";
        driverLines.push(`• ${vName} — ${name}`);
        if (s.soldierId) officerButtons.push([{ text: `✅ ${name} — ${vName}`, callback_data: `tripok:${s.id}` }]);
        if (s.soldier?.telegramChatId) {
          const text = `🚗 <b>שובצת למשימת נסיעה</b>\nתאריך: ${dateStr} · שעה: ${mission.departureTime}\nרכב: ${vName}\n\nיש לפתוח משימת נסיעה בקישור:\n${link}\n\n<b>לאחר שהקמת את ההרשאה/לינק — לחץ על הכפתור לדיווח.</b>`;
          await sendTelegramMessage(token, s.soldier.telegramChatId, text, {
            inline_keyboard: [[{ text: "✅ הקמתי הרשאת נסיעה", callback_data: `tripok:${s.id}` }]],
          });
        }
      }
    }

    if (driverLines.length) {
      const officers = await prisma.appUser.findMany({
        where: {
          battalionId: bId, active: true, soldier: { is: { telegramChatId: { not: null } } },
          OR: [{ holder: { warehouseType: "VEHICLES" } }, { assignedHolders: { some: { holder: { warehouseType: "VEHICLES" } } } }],
        },
        select: { soldier: { select: { telegramChatId: true } } },
      });
      const summary = `🚚 <b>נפתחה משימת נסיעה</b>\nתאריך: ${dateStr} · שעה: ${mission.departureTime}${mission.title ? `\nמשימה: ${mission.title}` : ""}\n\n<b>רכבים ונהגים:</b>\n${driverLines.join("\n")}\n\nניתן לאשר הקמת הרשאה בשם נהג בכפתורים:`;
      const seen = new Set<string>();
      for (const o of officers) {
        const chatId = o.soldier?.telegramChatId;
        if (chatId && !seen.has(chatId)) {
          seen.add(chatId);
          await sendTelegramMessage(token, chatId, summary, officerButtons.length ? { inline_keyboard: officerButtons } : undefined);
        }
      }
    }

    if (mission.commanderSoldier?.telegramChatId) {
      const cText = `👤 <b>הוגדרת כמפקד משימה</b>\nמשימה: ${mission.title || "נסיעה"}\nתאריך: ${dateStr} · שעה: ${mission.departureTime}\n\nבסיום המשימה — לחץ על הכפתור לסגירתה.`;
      await sendTelegramMessage(token, mission.commanderSoldier.telegramChatId, cText, {
        inline_keyboard: [[{ text: "✅ סיים משימה", callback_data: `mclose:${mission.id}` }]],
      });
    }
  } catch (e) {
    console.error("[notifyMissionCreated] failed (non-fatal):", e);
  }
}
