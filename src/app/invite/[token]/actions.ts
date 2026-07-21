"use server";

import { redirect } from "next/navigation";
import { setPasswordByInvite, createSession } from "@/lib/auth";
import { isPasswordPwned, validatePassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { TERMS_VERSION } from "@/lib/terms";

export type InviteState = { error?: string };

export async function activateAccount(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");

  // 📜 הסכמה לתנאים — נדרשת בהפעלת החשבון, שהיא הרגע הראשון של המשתמש.
  //    נבדקת בשרת ולא רק ב-checkbox, כדי שלא ניתן לעקוף בשליחת טופס ישירה.
  if (formData.get("acceptTerms") !== "on") {
    return { error: "יש לאשר את תנאי השימוש ומדיניות הפרטיות" };
  }

  const validationError = validatePassword(password);
  if (validationError) return { error: validationError };
  if (password !== confirm) return { error: "הסיסמאות אינן תואמות" };

  if (await isPasswordPwned(password)) {
    return { error: "סיסמה זו הופיעה בדליפות מידע ידועות. בחר/י סיסמה אחרת." };
  }

  const user = await setPasswordByInvite(token, password);
  if (!user) return { error: "ההזמנה אינה תקפה או שכבר נוצלה" };

  await prisma.appUser.update({
    where: { id: user.id },
    data: { termsAcceptedAt: new Date(), termsAcceptedVersion: TERMS_VERSION },
  });
  await createSession(user);
  await audit(user.id, "ACTIVATE", "AppUser", user.id, { termsVersion: TERMS_VERSION });
  // מפקד יחידה (מנהל Holder) — מונחה ישר להקים את הצוות שלו
  redirect(user.holderIds.length > 0 ? "/team" : "/");
}
