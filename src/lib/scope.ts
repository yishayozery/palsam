import type { SessionUser } from "./auth";
import { prisma } from "./prisma";

/**
 * הרשאות כפולות: מפצל את ה-holders של המשתמש לפי סוג (מחסן/פלוגה).
 * כך משתמש אחד יכול להיות מוסמך גם למחסן/מחסנים וגם לפלוגות/מחלקות,
 * וכל מסך מסתנן ל-holders הרלוונטיים לו (מחסן↔מחסנים, פלוגה↔פלוגות).
 * אדמין/אדמין-על → מערכים ריקים (רואים הכל, ללא סינון holder).
 */
export async function resolveHolderKinds(
  user: SessionUser,
): Promise<{ warehouseHolderIds: string[]; companyHolderIds: string[] }> {
  if (user.isSuperAdmin || user.isAdmin || user.holderIds.length === 0) {
    return { warehouseHolderIds: [], companyHolderIds: [] };
  }
  const holders = await prisma.holder.findMany({
    where: { id: { in: user.holderIds } },
    select: { id: true, kind: true },
  });
  return {
    warehouseHolderIds: holders.filter((h) => h.kind === "WAREHOUSE").map((h) => h.id),
    companyHolderIds: holders.filter((h) => h.kind === "COMPANY").map((h) => h.id),
  };
}

/**
 * בידוד רב-דיירים: כל שאילתה מסוננת לפי הגדוד של המשתמש.
 * אדמין-על (ללא גדוד) רואה הכל.
 */
export function battalionFilter(user: SessionUser): { battalionId?: string } {
  if (user.isSuperAdmin) return {};
  return { battalionId: user.battalionId ?? "__none__" };
}

/**
 * האם המשתמש מוגבל למחזיק מסוים (מנהל מחסן / נציג פלוגה).
 * least-privilege: כל משתמש שאינו אדמין ומשויך ל-holder — מוגבל אליו. כך גם משתמשי
 * ה-SystemRole החדש (שאצלם ה-role ה-legacy עשוי להיות VIEWER) מקבלים בידוד holder נכון,
 * ולא רק ה-enum הישן WAREHOUSE_MANAGER/COMPANY_REP. אדמין/אדמין-על → ללא הגבלה (רואים הכל).
 */
export function scopedHolderId(user: SessionUser): string | null {
  if (user.isSuperAdmin || user.isAdmin) return null;
  return user.holderId ?? null;
}

/** מסנן מחזיקים שהמשתמש רשאי לראות (לפי גדוד; מנהל מחסן/נציג — רק שלו) */
export function holderScopeWhere(user: SessionUser) {
  const base = battalionFilter(user);
  const scoped = scopedHolderId(user);
  if (scoped) return { ...base, id: scoped };
  return base;
}
