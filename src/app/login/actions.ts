"use server";

import { redirect } from "next/navigation";
import { authenticate, createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { checkRateLimit, getClientIp, RateLimitError } from "@/lib/rate-limit";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  const battalionCode = String(formData.get("battalionCode") || "").trim();

  if (!username || !password) {
    return { error: "יש להזין שם משתמש וסיסמה" };
  }

  // 🛡️ Rate limiting: עד 5 ניסיונות לכל IP בחלון של 15 דק'
  const ip = await getClientIp();
  try {
    await checkRateLimit("login", ip, { max: 5, windowSec: 900 });
  } catch (e) {
    if (e instanceof RateLimitError) {
      const min = Math.ceil(e.retryAfterSec / 60);
      return { error: `🛡️ יותר מדי ניסיונות התחברות. נסה שוב בעוד ${min} דקות.` };
    }
    throw e;
  }

  const user = await authenticate(username, password, battalionCode);
  if (!user) {
    // נסיון כושל - לתעד לאודיט בלי לחשוף את שם המשתמש
    return { error: "שם משתמש, סיסמה או מספר גדוד שגויים" };
  }

  await createSession(user);
  await audit(user.id, "LOGIN", "AppUser", user.id);
  redirect("/dashboard");
}
