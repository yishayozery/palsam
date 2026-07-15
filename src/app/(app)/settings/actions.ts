"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto";

export type OpsState = { ok?: boolean; error?: string };

export async function updateOperationalSettings(
  _prev: OpsState,
  formData: FormData,
): Promise<OpsState> {
  const user = await requireCapability("battalion.profile");
  const bId = user.battalionId!;

  const requirePersonalIdOnHandover = formData.get("requirePersonalIdOnHandover") === "on";
  const senderEmail = String(formData.get("senderEmail") || "").trim() || null;
  const notificationEmail = String(formData.get("notificationEmail") || "").trim() || null;
  const emailToBattalion = notificationEmail ? true : formData.get("emailToBattalion") === "on";
  const armoryTestUrl = String(formData.get("armoryTestUrl") || "").trim() || null;
  const telegramBotTokenRaw = String(formData.get("telegramBotToken") || "").trim() || null;
  const telegramBotToken = telegramBotTokenRaw ? encryptSecret(telegramBotTokenRaw) : null; // 🔐 מוצפן ב-rest
  const telegramBotInfo = String(formData.get("telegramBotInfo") || "").trim() || null;
  const soldierDepartureMessage = String(formData.get("soldierDepartureMessage") || "").trim() || null;

  if (!notificationEmail) return { error: "מייל לגיבוי תנועות חובה" };

  try {
    await prisma.battalion.update({
      where: { id: bId },
      data: { requirePersonalIdOnHandover, senderEmail, notificationEmail, emailToBattalion, armoryTestUrl, telegramBotToken, telegramBotInfo, soldierDepartureMessage },
    });
  } catch {
    return { error: "שמירה נכשלה" };
  }
  await audit(user.id, "UPDATE", "Battalion", bId);
  revalidatePath("/settings");
  revalidatePath("/profile");
  return { ok: true };
}
