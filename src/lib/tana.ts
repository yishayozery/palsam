import "server-only";
import { prisma } from "./prisma";

/** מוצא את פלוגת הטנא בגדוד (Holder kind=COMPANY ששמו מכיל "טנא") */
export async function findTanaHolder(battalionId: string) {
  return prisma.holder.findFirst({
    where: {
      battalionId,
      kind: "COMPANY",
      active: true,
      name: { contains: "טנא" },
    },
  });
}

/** מוצא סטטוס "תקול" — עדיפות לסטטוס בשם "תקול", אח"כ isWear=true; fallback לראשון שלא ברירת מחדל */
export async function findDefectiveStatusId(battalionId: string): Promise<string | null> {
  const named = await prisma.itemStatus.findFirst({
    where: { battalionId, active: true, name: { contains: "תקול" } },
  });
  if (named) return named.id;
  const wear = await prisma.itemStatus.findFirst({
    where: { battalionId, active: true, isWear: true },
    orderBy: { sortOrder: "asc" },
  });
  if (wear) return wear.id;
  const fallback = await prisma.itemStatus.findFirst({
    where: { battalionId, active: true, isDefault: false },
    orderBy: { sortOrder: "asc" },
  });
  return fallback?.id ?? null;
}

/** מוצא סטטוס "תקין" — ברירת מחדל */
export async function findOkStatusId(battalionId: string): Promise<string | null> {
  const def = await prisma.itemStatus.findFirst({
    where: { battalionId, active: true, isDefault: true },
  });
  if (def) return def.id;
  const any = await prisma.itemStatus.findFirst({
    where: { battalionId, active: true, isWear: false, isLoss: false },
    orderBy: { sortOrder: "asc" },
  });
  return any?.id ?? null;
}
