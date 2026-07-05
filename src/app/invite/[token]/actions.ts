"use server";

import { redirect } from "next/navigation";
import { setPasswordByInvite, createSession } from "@/lib/auth";
import { isPasswordPwned, validatePassword } from "@/lib/password";
import { audit } from "@/lib/audit";

export type InviteState = { error?: string };

export async function activateAccount(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");

  const validationError = validatePassword(password);
  if (validationError) return { error: validationError };
  if (password !== confirm) return { error: "הסיסמאות אינן תואמות" };

  if (await isPasswordPwned(password)) {
    return { error: "סיסמה זו הופיעה בדליפות מידע ידועות. בחר/י סיסמה אחרת." };
  }

  const user = await setPasswordByInvite(token, password);
  if (!user) return { error: "ההזמנה אינה תקפה או שכבר נוצלה" };

  await createSession(user);
  await audit(user.id, "ACTIVATE", "AppUser", user.id);
  // מפקד יחידה (מנהל Holder) — מונחה ישר להקים את הצוות שלו
  redirect(user.holderIds.length > 0 ? "/team" : "/");
}
