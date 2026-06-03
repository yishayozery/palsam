import "server-only";
import { redirect } from "next/navigation";
import { getSession, type SessionUser } from "./auth";
import { can, type Capability } from "./rbac";

/** מחזיר את המשתמש המחובר או מפנה ל-login */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}

/** דורש יכולת מסוימת; אחרת מפנה לדשבורד */
export async function requireCapability(cap: Capability): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, cap)) redirect("/dashboard");
  return user;
}
