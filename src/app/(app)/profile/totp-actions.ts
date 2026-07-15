"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { generateTotpSetup, verifyTotp } from "@/lib/totp";
import { audit } from "@/lib/audit";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

export type TotpSetupState = { qrDataUrl?: string; secret?: string; error?: string };

/** שלב 1: יוצר secret זמני ו-QR code (לא שומר עד אימות) */
export async function startTotpSetup(): Promise<TotpSetupState> {
  const user = await requireUser();
  if (user.role === "VIEWER") return { error: "אין הרשאה" };
  try {
    const { secret, qrDataUrl } = await generateTotpSetup(user.username);
    return { secret, qrDataUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** שלב 2: מאמת קוד 6 ספרות + שומר ב-DB */
export async function confirmTotpSetup(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const user = await requireUser();
  const secret = String(formData.get("secret") || "");
  const token = String(formData.get("token") || "").trim();
  if (!secret || !token) return { error: "חסר secret או קוד" };
  if (!verifyTotp(token, secret)) return { error: "❌ קוד שגוי. ודא ששעון הטלפון שלך מעודכן ונסה שוב." };

  await prisma.appUser.update({
    where: { id: user.id },
    data: { totpSecret: encryptSecret(secret), totpEnabledAt: new Date() }, // 🔐 מוצפן ב-rest
  });
  await audit(user.id, "ENABLE_2FA", "AppUser", user.id);
  revalidatePath("/profile");
  return { ok: true };
}

/** ביטול 2FA (דורש אימות קוד עכשווי לוודא שאינך נעול בחוץ) */
export async function disableTotp(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const user = await requireUser();
  const token = String(formData.get("token") || "").trim();
  const u = await prisma.appUser.findUnique({ where: { id: user.id }, select: { totpSecret: true } });
  if (!u?.totpSecret) return { error: "2FA לא פעיל" };
  if (!verifyTotp(token, decryptSecret(u.totpSecret))) return { error: "❌ קוד שגוי" };
  await prisma.appUser.update({ where: { id: user.id }, data: { totpSecret: null, totpEnabledAt: null } });
  await audit(user.id, "DISABLE_2FA", "AppUser", user.id);
  revalidatePath("/profile");
  return { ok: true };
}
