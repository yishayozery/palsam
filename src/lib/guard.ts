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

/** דורש יכולת מסוימת; אחרת מפנה לדף הבית */
export async function requireCapability(cap: Capability): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, cap)) redirect("/");
  return user;
}

/** דורש אדמין-על */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/");
  return user;
}

/** דורש משתמש המשויך לגדוד (כל מי שאינו אדמין-על) */
export async function requireBattalion(): Promise<SessionUser & { battalionId: string }> {
  const user = await requireUser();
  if (!user.battalionId) redirect("/");
  return user as SessionUser & { battalionId: string };
}
