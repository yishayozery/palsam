import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./prisma";
import { hashPassword, verifyPassword } from "./password";
import type { Role, PermissionLevel } from "@/generated/prisma";
import { ROLE_LABELS, permissionsFromLegacyRole, type UserPermissions, type PermissionHolder } from "./rbac";

export { hashPassword, verifyPassword };

/**
 * מחזיר את סוד ה-JWT של ה-session. בפרודקשן — חובה AUTH_SECRET, אחרת נזרקת
 * שגיאה. ההערכה עצלה (בזמן-בקשה, לא ב-import) כדי לא לשבור `next build`.
 */
function getSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set in production for session JWT signing");
    }
    return new TextEncoder().encode("dev-secret-change-me-please-32-characters");
  }
  return new TextEncoder().encode(raw);
}
const JWT_ALG = "HS256";
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
  canApproveWeapons: boolean; // הרשאה פר-משתמש לאשר חיילים לנשק
} & PermissionHolder;


export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());

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
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: [JWT_ALG] });
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
      // חדש: ברירת-מחדל לסשנים ישנים — fallback לפי הרשאת armory קיימת (המשכיות עד re-login)
      canApproveWeapons: typeof payload.canApproveWeapons === "boolean"
        ? payload.canApproveWeapons
        : (isAdmin || permissions?.["armory" as keyof UserPermissions] === "EDIT"),
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
  canApproveWeapons?: boolean;
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
    canApproveWeapons: !!user.canApproveWeapons,
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
  // שם משתמש ייחודי פר-גדוד — ייתכנו כמה משתמשים באותו שם בגדודים שונים.
  // לכן שולפים את כל המועמדים ובוחרים לפי שדה "מספר גדוד".
  const candidates = await prisma.appUser.findMany({
    where: { username: { equals: username, mode: "insensitive" }, active: true, passwordSet: true },
    include: {
      customRole: true,
      systemRole: { include: { permissions: true } },
      assignedHolders: true,
      assignedSquads: true,
      battalion: { select: { code: true, brigade: true, name: true } },
    },
  });
  if (candidates.length === 0) return { kind: "fail" };

  const code = (battalionCode ?? "").trim().toLowerCase();
  for (const user of candidates) {
    // ⚠️ ולידציית שדה "מספר גדוד":
    let battalionOk: boolean;
    if (user.role === "SUPER_ADMIN") {
      // אדמין-על: אם הוגדר קוד כניסה נוסף (loginCode) — חייב להזין אותו בשדה "מספר גדוד".
      battalionOk = !user.loginCode || (battalionCode ?? "").trim() === user.loginCode.trim();
    } else {
      // כל השאר: חייבים להזין את קוד/חטיבה/שם הגדוד שלהם.
      if (!code) continue;
      const accepted = [
        user.battalion?.code?.trim().toLowerCase(),
        user.battalion?.brigade?.trim().toLowerCase(),
        user.battalion?.name?.trim().toLowerCase(),
      ].filter(Boolean) as string[];
      battalionOk = accepted.includes(code);
    }
    if (!battalionOk) continue;

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) continue;

    // 🔐 2FA — אם המשתמש הפעיל TOTP, נדרש קוד נוסף
    if (user.totpSecret) return { kind: "totp_required", userId: user.id };
    return { kind: "ok", user: toSession(user) };
  }
  return { kind: "fail" };
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
  // אם כבר הוגדרה סיסמה — הקישור מנוטרל; אין לאפשר איפוס סיסמה דרכו.
  if (user.passwordSet) return null;
  const hash = await hashPassword(password);
  // שומרים את ה-inviteToken כדי שדף ההזמנה יזהה "כבר הוגדרה סיסמה" ויפנה ללוגין
  // (במקום להציג "קישור לא תקין"). הקישור מנוטרל ע"י בדיקת passwordSet לעיל.
  const updated = await prisma.appUser.update({
    where: { id: user.id },
    data: { passwordHash: hash, passwordSet: true },
    include: { customRole: true, systemRole: { include: { permissions: true } }, assignedHolders: true, assignedSquads: true },
  });
  return toSession(updated);
}

/** בונה את פרטי עוגיית ה-session — לשימוש ב-Route Handler (שם לא ניתן לקרוא ל-createSession). */
export async function buildSessionCookie(user: SessionUser) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());
  return {
    name: COOKIE,
    value: token,
    options: { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE },
  };
}

/** מממש לינק כניסה חד-פעמי (מהבוט) — מאמת תוקף, מבטל (חד-פעמי), ומחזיר SessionUser. */
export async function consumeMagicToken(token: string): Promise<SessionUser | null> {
  if (!token) return null;
  const user = await prisma.appUser.findUnique({
    where: { magicToken: token },
    include: { customRole: true, systemRole: { include: { permissions: true } }, assignedHolders: true, assignedSquads: true },
  });
  if (!user) return null;
  const valid = user.active && user.magicTokenExp && user.magicTokenExp.getTime() >= Date.now();
  // חד-פעמי: מבטלים את הטוקן בכל מקרה (גם אם פג/לא תקף)
  await prisma.appUser.update({ where: { id: user.id }, data: { magicToken: null, magicTokenExp: null } }).catch(() => {});
  return valid ? toSession(user) : null;
}
