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
      holderId: (payload.holderId as string) ?? null,
      holderIds: (payload.holderIds as string[]) ?? ((payload.holderId as string) ? [payload.holderId as string] : []),
      battalionId: (payload.battalionId as string) ?? null,
    };
  } catch {
    return null;
  }
}

function toSession(user: {
  id: string; username: string; fullName: string; role: Role; holderId: string | null; battalionId: string | null;
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
    holderId: user.holderId,
    holderIds: [...ids],
    battalionId: user.battalionId,
  };
}

/** מאמת שם משתמש + סיסמה + מספר גדוד (אופציונלי לאדמין-על). case-insensitive על שם משתמש */
export async function authenticate(
  username: string,
  password: string,
  battalionCode?: string,
): Promise<SessionUser | null> {
  const user = await prisma.appUser.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
    include: { customRole: true, assignedHolders: true, battalion: { select: { code: true, brigade: true } } },
  });
  if (!user || !user.active || !user.passwordSet) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  // ⚠️ ולידציית גדוד: אדמין-על פטור (אין לו גדוד); כל השאר חייבים להזין את הקוד שלהם.
  if (user.role !== "SUPER_ADMIN") {
    const code = (battalionCode ?? "").trim();
    if (!code) return null; // חייבים להזין מספר גדוד
    const myCode = (user.battalion?.code ?? "").trim();
    const myBrigade = (user.battalion?.brigade ?? "").trim();
    // מקבל קוד גדוד או חטיבה (גמיש למשתמש)
    if (code !== myCode && code !== myBrigade) return null;
  }
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
