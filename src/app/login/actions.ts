"use server";

import { redirect } from "next/navigation";
import { authenticate, createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  if (!username || !password) {
    return { error: "יש להזין שם משתמש וסיסמה" };
  }

  const user = await authenticate(username, password);
  if (!user) {
    return { error: "שם משתמש או סיסמה שגויים" };
  }

  await createSession(user);
  await audit(user.id, "LOGIN", "AppUser", user.id);
  redirect("/dashboard");
}
