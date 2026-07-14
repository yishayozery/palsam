import { prisma } from "@/lib/prisma";

/** סעיפי בדיקה ברירת-מחדל לסבב נשקייה (ניתנים לעריכה בהגדרות). */
export const DEFAULT_ARMORY_CHECKLIST = [
  "מנעולים שלמים ותקינים",
  "יש שומר בעמדה",
  "כמות נשקים תואמת לרישום",
  "כספת/ארגז נשק נעול",
  "יומן שמירה מלא ומעודכן",
  "ניקיון ותחזוקת העמדה",
  "תעודות סבב בתוקף",
];

/** זריעת סעיפי ברירת-מחדל אם הגדוד עדיין ללא סעיפים. idempotent. */
export async function ensureArmoryChecklist(battalionId: string): Promise<void> {
  const count = await prisma.armoryChecklistItem.count({ where: { battalionId } });
  if (count > 0) return;
  await prisma.armoryChecklistItem.createMany({
    data: DEFAULT_ARMORY_CHECKLIST.map((label, i) => ({ battalionId, label, sortOrder: i })),
  });
}
