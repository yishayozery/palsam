"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

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
  const telegramBotToken = String(formData.get("telegramBotToken") || "").trim() || null;
  const telegramBotInfo = String(formData.get("telegramBotInfo") || "").trim() || null;

  if (!notificationEmail) return { error: "מייל לגיבוי תנועות חובה" };

  try {
    await prisma.battalion.update({
      where: { id: bId },
      data: { requirePersonalIdOnHandover, senderEmail, notificationEmail, emailToBattalion, telegramBotToken, telegramBotInfo },
    });
  } catch {
    return { error: "שמירה נכשלה" };
  }
  await audit(user.id, "UPDATE", "Battalion", bId);
  revalidatePath("/settings");
  revalidatePath("/profile");
  return { ok: true };
}
