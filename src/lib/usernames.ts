import "server-only";
import { prisma } from "./prisma";

/**
 * מחזיר שם משתמש ייחודי גלובלית. אם השם תפוס — משרשר את קוד הגדוד/חטיבה,
 * ואם עדיין תפוס — מוסיף מספר. כך לא מתרחשת קריסת unique constraint.
 */
export async function resolveUniqueUsername(
  entered: string,
  suffixCode?: string | null,
  excludeUserId?: string,
): Promise<string> {
  const clean = entered.trim().replace(/\s+/g, "_");
  const taken = async (u: string) => {
    const ex = await prisma.appUser.findUnique({ where: { username: u } });
    return !!ex && ex.id !== excludeUserId;
  };

  if (!(await taken(clean))) return clean;

  const suffixed = suffixCode ? `${clean}.${suffixCode.toLowerCase().replace(/\s+/g, "")}` : clean;
  if (suffixed !== clean && !(await taken(suffixed))) return suffixed;

  const root = suffixed;
  for (let i = 2; i < 200; i++) {
    const cand = `${root}${i}`;
    if (!(await taken(cand))) return cand;
  }
  return `${root}.${clean.length}`;
}
