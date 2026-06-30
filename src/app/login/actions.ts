"use server";

import { redirect } from "next/navigation";
import { authenticate, completeAuthWithTotp, createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { checkRateLimit, getClientIp, RateLimitError } from "@/lib/rate-limit";

export type LoginState = {
  error?: string;
  step?: "totp"; // אם דרוש קוד 2FA
  pendingUserId?: string; // לזיהוי השלב השני
};

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  const battalionCode = String(formData.get("battalionCode") || "").trim();
  const totpToken = String(formData.get("totpToken") || "").trim();
  const pendingUserId = String(formData.get("pendingUserId") || "").trim();
  const honeypot = String(formData.get("website") || "").trim(); // 🪤 honeypot

  // 🪤 Honeypot — בוט שמילא שדה נסתר נחסם בשקט
  if (honeypot) {
    return { error: "שגיאה כללית" };
  }

  // 🛡️ Rate limiting — per IP + per username
  const ip = await getClientIp();
  try {
    await checkRateLimit("login", ip, { max: 5, windowSec: 900 });
    if (username) await checkRateLimit("login-user", username.toLowerCase(), { max: 5, windowSec: 900 });
  } catch (e) {
    if (e instanceof RateLimitError) {
      const min = Math.ceil(e.retryAfterSec / 60);
      return { error: `🛡️ יותר מדי ניסיונות התחברות. נסה שוב בעוד ${min} דקות.` };
    }
    throw e;
  }

  // 🔐 שלב 2 — אימות קוד 2FA אחרי סיסמה תקינה
  if (pendingUserId && totpToken) {
    const sessionUser = await completeAuthWithTotp(pendingUserId, totpToken);
    if (!sessionUser) {
      return { step: "totp", pendingUserId, error: "❌ קוד שגוי" };
    }
    await createSession(sessionUser);
    await audit(sessionUser.id, "LOGIN", "AppUser", sessionUser.id, { method: "password+totp" });
    redirect("/dashboard");
  }

  // שלב 1 — סיסמה
  if (!username || !password) {
    return { error: "יש להזין שם משתמש וסיסמה" };
  }

  const result = await authenticate(username, password, battalionCode);

  if (result.kind === "fail") {
    return { error: "שם משתמש, סיסמה או מספר גדוד שגויים" };
  }
  if (result.kind === "totp_required") {
    return { step: "totp", pendingUserId: result.userId };
  }

  // התחברות הצליחה בלי 2FA
  await createSession(result.user);
  await audit(result.user.id, "LOGIN", "AppUser", result.user.id);
  redirect("/dashboard");
}
