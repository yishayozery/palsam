"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { ALL_RECIPIENT_TAGS } from "@/lib/botNotifications";

/** עדכון חוק תזכורת בוט (פעיל / כמה ימים לפני / למי). מנהל בלבד. */
export async function saveNotificationRule(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    if (!user.isAdmin) return { error: "אין הרשאה" };
    const bId = user.battalionId!;
    const id = String(formData.get("id") || "");
    const enabled = formData.get("enabled") === "on" || formData.get("enabled") === "true";
    const daysBefore = Math.max(0, Math.min(30, parseInt(String(formData.get("daysBefore") || "0"), 10) || 0));
    const recipients = formData.getAll("recipients").map(String).filter((r) => ALL_RECIPIENT_TAGS.includes(r)).join(",");

    const rule = await prisma.botNotificationRule.findUnique({ where: { id }, select: { battalionId: true } });
    if (!rule || rule.battalionId !== bId) return { error: "חוק לא נמצא" };

    await prisma.botNotificationRule.update({ where: { id }, data: { enabled, daysBefore, recipients, updatedById: user.id } });
    await audit(user.id, "UPDATE_NOTIFICATION_RULE", "BotNotificationRule", id, { enabled, daysBefore, recipients });
    revalidatePath("/notifications");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}
