import "server-only";
import type { Prisma } from "@/generated/prisma";

/**
 * עדכון יתרת מלאי כמותי עבור (פריט × מחזיק × סטטוס).
 * delta חיובי = הוספה, שלילי = גריעה. לא יורד מתחת ל-0.
 */
export async function adjustQuantity(
  tx: Prisma.TransactionClient,
  itemTypeId: string,
  holderId: string,
  statusId: string,
  delta: number,
): Promise<void> {
  const existing = await tx.stockBalance.findUnique({
    where: { itemTypeId_holderId_statusId: { itemTypeId, holderId, statusId } },
  });
  const next = Math.max(0, (existing?.quantity ?? 0) + delta);
  if (existing) {
    await tx.stockBalance.update({
      where: { id: existing.id },
      data: { quantity: next },
    });
  } else if (delta > 0) {
    await tx.stockBalance.create({
      data: { itemTypeId, holderId, statusId, quantity: next },
    });
  }
}

/** ברירת מחדל לסטטוס "תקין" (או הראשון הפעיל) */
export async function defaultStatusId(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const def = await tx.itemStatus.findFirst({
    where: { isDefault: true, active: true },
  });
  if (def) return def.id;
  const first = await tx.itemStatus.findFirst({ where: { active: true } });
  if (!first) throw new Error("לא הוגדרו סטטוסי ציוד");
  return first.id;
}
