import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { Role, PermissionLevel } from "@/generated/prisma";
import { ROLE_LABELS, permissionsFromLegacyRole, type UserPermissions, type PermissionHolder } from "./rbac";

const RAW_SECRET = process.env.AUTH_SECRET || "dev-secret-change-me-please-32-characters";
if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) {
  console.error("⚠️ AUTH_SECRET is not set — using insecure default. Set AUTH_SECRET in production!");
}
const SECRET = new TextEncoder().encode(RAW_SECRET);
const COOKIE = "gadsam_session";
const MAX_AGE = 60 * 60 * 12; // 12 שעות

export type SessionUser = {
  id: string;
  username: string;
  fullName: string;
  role: Role; // legacy — נשמר לתאימות
  roleLabel: string;
  title: string | null;
  holderId: string | null;
  holderIds: string[];
  squadIds: string[];
  battalionId: string | null;
  permissions: UserPermissions;
  isAdmin: boolean;
  isSuperAdmin: boolean;
} & PermissionHolder;

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(SECRET);

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (!payload.id || !payload.username || !payload.role) return null;
    const role = payload.role as Role;
    const permissions = (payload.permissions as UserPermissions) ?? permissionsFromLegacyRole(role);
    const isAdmin = (payload.isAdmin as boolean) ?? (role === "BATTALION_ADMIN");
    const isSuperAdmin = (payload.isSuperAdmin as boolean) ?? (role === "SUPER_ADMIN");
    return {
      id: payload.id as string,
      username: payload.username as string,
      fullName: payload.fullName as string,
      role,
      roleLabel: (payload.roleLabel as string) ?? ROLE_LABELS[role],
      title: (payload.title as string) ?? null,
      holderId: (payload.holderId as string) ?? null,
      holderIds: (payload.holderIds as string[]) ?? ((payload.holderId as string) ? [payload.holderId as string] : []),
      squadIds: (payload.squadIds as string[]) ?? [],
      battalionId: (payload.battalionId as string) ?? null,
      permissions,
      isAdmin,
      isSuperAdmin,
    };
  } catch {
    return null;
  }
}

function toSession(user: {
  id: string; username: string; fullName: string; title?: string | null; role: Role; holderId: string | null; battalionId: string | null;
  customRole?: { name: string } | null;
  systemRole?: { name: string; isAdmin: boolean; isPreset: boolean; permissions: { screen: string; level: PermissionLevel }[] } | null;
  assignedHolders?: { holderId: string }[];
  assignedSquads?: { squadId: string }[];
}): SessionUser {
  const ids = new Set<string>();
  for (const a of user.assignedHolders ?? []) ids.add(a.holderId);
  if (user.holderId) ids.add(user.holderId);

  const isSuperAdmin = user.role === "SUPER_ADMIN";

  let permissions: UserPermissions;
  let isAdmin: boolean;
  let roleLabel: string;

  if (user.systemRole) {
    permissions = {};
    for (const p of user.systemRole.permissions) {
      permissions[p.screen as keyof UserPermissions] = p.level;
    }
    isAdmin = user.systemRole.isAdmin;
    roleLabel = user.systemRole.name;
  } else {
    permissions = permissionsFromLegacyRole(user.role);
    isAdmin = user.role === "BATTALION_ADMIN";
    roleLabel = user.customRole?.name ?? ROLE_LABELS[user.role];
  }

  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    roleLabel,
    title: user.title ?? null,
    holderId: user.holderId,
    holderIds: [...ids],
    squadIds: (user.assignedSquads ?? []).map((s) => s.squadId),
    battalionId: user.battalionId,
    permissions,
    isAdmin,
    isSuperAdmin,
  };
}

/** תוצאה של ניסיון התחברות */
export type AuthResult =
  | { kind: "ok"; user: SessionUser }
  | { kind: "totp_required"; userId: string } // צריך לבקש קוד 2FA
  | { kind: "fail" };

/** מאמת שם משתמש + סיסמה + מספר גדוד (אופציונלי לאדמין-על). case-insensitive על שם משתמש */
export async function authenticate(
  username: string,
  password: string,
  battalionCode?: string,
): Promise<AuthResult> {
  const user = await prisma.appUser.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
    include: {
      customRole: true,
      systemRole: { include: { permissions: true } },
      assignedHolders: true,
      assignedSquads: true,
      battalion: { select: { code: true, brigade: true, name: true } },
    },
  });
  if (!user || !user.active || !user.passwordSet) return { kind: "fail" };
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return { kind: "fail" };
  // ⚠️ ולידציית גדוד: אדמין-על פטור (אין לו גדוד); כל השאר חייבים להזין את הקוד שלהם.
  if (user.role !== "SUPER_ADMIN") {
    const code = (battalionCode ?? "").trim().toLowerCase();
    if (!code) return { kind: "fail" };
    const accepted = [
      user.battalion?.code?.trim().toLowerCase(),
      user.battalion?.brigade?.trim().toLowerCase(),
      user.battalion?.name?.trim().toLowerCase(),
    ].filter(Boolean) as string[];
    if (!accepted.includes(code)) return { kind: "fail" };
  }
  // 🔐 2FA — אם המשתמש הפעיל TOTP, נדרש קוד נוסף
  if (user.totpSecret) {
    return { kind: "totp_required", userId: user.id };
  }
  return { kind: "ok", user: toSession(user) };
}

/** שלב 2 של 2FA — אימות קוד TOTP אחרי סיסמה תקינה */
export async function completeAuthWithTotp(userId: string, token: string): Promise<SessionUser | null> {
  const { verifyTotp } = await import("./totp");
  const user = await prisma.appUser.findUnique({
    where: { id: userId },
    include: {
      customRole: true,
      systemRole: { include: { permissions: true } },
      assignedHolders: true,
      assignedSquads: true,
      battalion: { select: { code: true, brigade: true, name: true } },
    },
  });
  if (!user || !user.totpSecret || !user.active) return null;
  if (!verifyTotp(token, user.totpSecret)) return null;
  return toSession(user);
}

/** הגדרת סיסמה ראשונה דרך קישור הזמנה — מחזיר SessionUser או null */
export async function setPasswordByInvite(
  token: string,
  password: string,
): Promise<SessionUser | null> {
  const user = await prisma.appUser.findUnique({ where: { inviteToken: token } });
  if (!user || !user.active) return null;
  const hash = await hashPassword(password);
  const updated = await prisma.appUser.update({
    where: { id: user.id },
    data: { passwordHash: hash, passwordSet: true, inviteToken: null },
    include: { customRole: true, systemRole: { include: { permissions: true } }, assignedHolders: true, assignedSquads: true },
  });
  return toSession(updated);
}
