import "server-only";
import argon2 from "argon2";
import { createHash } from "node:crypto";

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    if (hash.startsWith("$2a$") || hash.startsWith("$2b$")) {
      const bcrypt = await import("bcryptjs");
      return bcrypt.default.compare(password, hash);
    }
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export const PASSWORD_RULES = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecial: true,
};

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_RULES.minLength)
    return `סיסמה חייבת להיות לפחות ${PASSWORD_RULES.minLength} תווים`;
  if (password.length > PASSWORD_RULES.maxLength)
    return `סיסמה ארוכה מדי (מקסימום ${PASSWORD_RULES.maxLength} תווים)`;
  if (PASSWORD_RULES.requireUppercase && !/[A-Z]/.test(password))
    return "סיסמה חייבת לכלול לפחות אות גדולה באנגלית (A-Z)";
  if (PASSWORD_RULES.requireLowercase && !/[a-z]/.test(password))
    return "סיסמה חייבת לכלול לפחות אות קטנה באנגלית (a-z)";
  if (PASSWORD_RULES.requireDigit && !/\d/.test(password))
    return "סיסמה חייבת לכלול לפחות ספרה (0-9)";
  if (PASSWORD_RULES.requireSpecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password))
    return "סיסמה חייבת לכלול לפחות תו מיוחד (!@#$%...)";
  return null;
}

export async function isPasswordPwned(password: string): Promise<boolean> {
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return false;
    const body = await res.text();
    return body.split("\n").some((line) => line.split(":")[0].trim() === suffix);
  } catch {
    return false;
  }
}
