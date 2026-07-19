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

/** גישת "קצין רכב" — תואם למסך /driving-licenses (רישיונות/שבצ"ק/תחזוקה/אדמין). */
export function canVehicleAccess(user: SessionUser): boolean {
  return user.isAdmin || can(user, "dispatch.manage") || can(user, "driving_licenses") || can(user, "maintenance.manage") || can(user, "battalion.profile");
}
export async function requireVehicleAccess(): Promise<SessionUser> {
  const user = await requireUser();
  if (!canVehicleAccess(user)) redirect("/");
  return user;
}

/** הרשאה פר-משתמש לאשר חיילים לנשק (canApproveWeapons) — אדמין תמיד מורשה. */
export function canApproveWeapons(user: SessionUser): boolean {
  return user.isSuperAdmin || user.isAdmin || user.canApproveWeapons;
}

/** דורש הרשאת אישור חיילים לנשק (פר-משתמש, לא לפי תפקיד). */
export async function requireWeaponsApprover(): Promise<SessionUser> {
  const user = await requireUser();
  if (!canApproveWeapons(user)) redirect("/");
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
