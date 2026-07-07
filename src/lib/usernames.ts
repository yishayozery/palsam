import "server-only";
import { prisma } from "./prisma";

/**
 * מחזיר שם משתמש ייחודי **בתוך הגדוד** (ולא גלובלית). שם משתמש זהה יכול להתקיים
 * בגדודים שונים. אם השם תפוס בתוך אותו גדוד — מוסיף מספר (2,3,...) עד שנמצא פנוי,
 * כדי לא לקרוס על ה-unique constraint [battalionId, username]. cross-gadud לא מתנגש
 * ולכן לא משורשר שום דבר — זה מונע את הבאג שבו שם משתמש הפך למספר בגלל התנגשות בין-גדודית.
 *
 * @param battalionId הגדוד לבדוק בו ייחודיות (null עבור אדמין-על).
 */
export async function resolveUniqueUsername(
  entered: string,
  battalionId: string | null,
  excludeUserId?: string,
): Promise<string> {
  const clean = entered.trim().replace(/\s+/g, "_");
  const taken = async (u: string) => {
    const ex = await prisma.appUser.findFirst({
      where: { username: { equals: u, mode: "insensitive" }, battalionId: battalionId ?? null },
      select: { id: true },
    });
    return !!ex && ex.id !== excludeUserId;
  };

  if (!(await taken(clean))) return clean;

  for (let i = 2; i < 500; i++) {
    const cand = `${clean}${i}`;
    if (!(await taken(cand))) return cand;
  }
  return `${clean}_${clean.length}`;
}

/**
 * בודק אם שם משתמש כבר תפוס בתוך הגדוד (case-insensitive). מחזיר true אם תפוס.
 * שימושי כשרוצים להחזיר שגיאה מפורשת למשתמש במקום לשרשר מספר בשקט.
 */
export async function usernameTakenInBattalion(
  username: string,
  battalionId: string | null,
  excludeUserId?: string,
): Promise<boolean> {
  const clean = username.trim().replace(/\s+/g, "_");
  const ex = await prisma.appUser.findFirst({
    where: { username: { equals: clean, mode: "insensitive" }, battalionId: battalionId ?? null },
    select: { id: true },
  });
  return !!ex && ex.id !== excludeUserId;
}
