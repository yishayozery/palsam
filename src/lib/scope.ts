import type { SessionUser } from "./auth";

/**
 * בידוד רב-דיירים: כל שאילתה מסוננת לפי הגדוד של המשתמש.
 * אדמין-על (ללא גדוד) רואה הכל.
 */
export function battalionFilter(user: SessionUser): { battalionId?: string } {
  if (user.role === "SUPER_ADMIN") return {};
  return { battalionId: user.battalionId ?? "__none__" };
}

/** האם המשתמש מוגבל למחזיק מסוים (מנהל מחסן / נציג פלוגה) */
export function scopedHolderId(user: SessionUser): string | null {
  if (user.role === "WAREHOUSE_MANAGER" || user.role === "COMPANY_REP") {
    return user.holderId;
  }
  return null;
}

/** מסנן מחזיקים שהמשתמש רשאי לראות (לפי גדוד; מנהל מחסן/נציג — רק שלו) */
export function holderScopeWhere(user: SessionUser) {
  const base = battalionFilter(user);
  const scoped = scopedHolderId(user);
  if (scoped) return { ...base, id: scoped };
  return base;
}
