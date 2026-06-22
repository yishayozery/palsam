import "server-only";
import { redirect } from "next/navigation";
import { getSession, type SessionUser } from "./auth";
import { can, canEdit, type Capability, type Screen } from "./rbac";

/** מחזיר את המשתמש המחובר או מפנה ל-login */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}

/** דורש יכולת מסוימת (legacy); אחרת מפנה לדף הבית */
export async function requireCapability(cap: Capability): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, cap)) redirect("/");
  return user;
}

/** דורש גישת צפייה למסך */
export async function requireScreen(screen: Screen): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, screen)) redirect("/");
  return user;
}

/** דורש גישת עריכה למסך */
export async function requireScreenEdit(screen: Screen): Promise<SessionUser> {
  const user = await requireUser();
  if (!canEdit(user, screen)) redirect("/");
  return user;
}

/** דורש אדמין-על */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/");
  return user;
}

/** דורש אדמין (מפמ / מנהל מערכת) */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin && !user.isSuperAdmin) redirect("/");
  return user;
}

/** דורש משתמש המשויך לגדוד (כל מי שאינו אדמין-על) */
export async function requireBattalion(): Promise<SessionUser & { battalionId: string }> {
  const user = await requireUser();
  if (!user.battalionId) redirect("/");
  return user as SessionUser & { battalionId: string };
}
