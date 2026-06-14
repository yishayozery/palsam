import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { Role } from "@/generated/prisma";
import { ROLE_LABELS } from "./rbac";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-me-please-32-characters",
);
const COOKIE = "gadsam_session";
const MAX_AGE = 60 * 60 * 12; // 12 שעות

export type SessionUser = {
  id: string;
  username: string;
  fullName: string;
  role: Role; // פרופיל ההרשאות בפועל
  roleLabel: string; // שם התצוגה (תפקיד מותאם או ברירת מחדל)
  title: string | null; // תואר/תפקיד מותאם של המשתמש (מ"פ, רס"פ, מפלג וכו') — מוצג בסיידבר
  holderId: string | null; // מחזיק ראשי
  holderIds: string[]; // כל המחזיקים המשויכים (תמיכה בכמה מחסנים)
  battalionId: string | null;
};

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
    return {
      id: payload.id as string,
      username: payload.username as string,
      fullName: payload.fullName as string,
      role: payload.role as Role,
      roleLabel: (payload.roleLabel as string) ?? ROLE_LABELS[payload.role as Role],
      title: (payload.title as string) ?? null,
      holderId: (payload.holderId as string) ?? null,
      holderIds: (payload.holderIds as string[]) ?? ((payload.holderId as string) ? [payload.holderId as string] : []),
      battalionId: (payload.battalionId as string) ?? null,
    };
  } catch {
    return null;
  }
}

function toSession(user: {
  id: string; username: string; fullName: string; title?: string | null; role: Role; holderId: string | null; battalionId: string | null;
  customRole?: { name: string } | null;
  assignedHolders?: { holderId: string }[];
}): SessionUser {
  const ids = new Set<string>();
  for (const a of user.assignedHolders ?? []) ids.add(a.holderId);
  if (user.holderId) ids.add(user.holderId);
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    roleLabel: user.customRole?.name ?? ROLE_LABELS[user.role],
    title: user.title ?? null,
    holderId: user.holderId,
    holderIds: [...ids],
    battalionId: user.battalionId,
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
    include: { customRole: true, assignedHolders: true, battalion: { select: { code: true, brigade: true, name: true } } },
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
    include: { customRole: true, assignedHolders: true, battalion: { select: { code: true, brigade: true, name: true } } },
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
    include: { customRole: true, assignedHolders: true },
  });
  return toSession(updated);
}
