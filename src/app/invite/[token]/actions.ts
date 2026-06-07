"use server";

import { redirect } from "next/navigation";
import { setPasswordByInvite, createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export type InviteState = { error?: string };

export async function activateAccount(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");

  if (password.length < 8) return { error: "סיסמה חייבת להיות לפחות 8 תווים" };
  if (password !== confirm) return { error: "הסיסמאות אינן תואמות" };

  const user = await setPasswordByInvite(token, password);
  if (!user) return { error: "ההזמנה אינה תקפה או שכבר נוצלה" };

  await createSession(user);
  await audit(user.id, "ACTIVATE", "AppUser", user.id);
  redirect("/");
}
