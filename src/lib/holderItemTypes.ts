import "server-only";
import { prisma } from "@/lib/prisma";

type H = { id: string; kind: string };

/**
 * מפת holderId → רשימת itemTypeIds שקיימים בפועל אצל המחזיק:
 *  • מלאי כמותי (StockBalance qty>0)
 *  • יחידות סריאליות שנמצאות פיזית במחסן (currentHolderId)
 *  • ציוד סריאלי שהוחתם לחיילי הפלוגה (עבור מחזיקי COMPANY)
 * משמש לסינון data-driven של הקטגוריות/פריטים בטופס פתיחת ספירה — שיציג רק את מה
 * שקיים במחסן/פלוגה שנבחרו, ולא את כל הקטלוג.
 */
export async function buildHolderItemTypes(bId: string, holders: H[]): Promise<Record<string, string[]>> {
  const holderIds = holders.map((h) => h.id);
  const companyIds = holders.filter((h) => h.kind === "COMPANY").map((h) => h.id);
  const [sb, su, suComp] = await Promise.all([
    prisma.stockBalance.findMany({
      where: { battalionId: bId, holderId: { in: holderIds }, quantity: { gt: 0 } },
      select: { holderId: true, itemTypeId: true }, distinct: ["holderId", "itemTypeId"],
    }),
    prisma.serialUnit.findMany({
      where: { battalionId: bId, dischargedAt: null, currentHolderId: { in: holderIds } },
      select: { currentHolderId: true, itemTypeId: true }, distinct: ["currentHolderId", "itemTypeId"],
    }),
    companyIds.length
      ? prisma.serialUnit.findMany({
          where: { battalionId: bId, dischargedAt: null, signedSoldier: { is: { companyId: { in: companyIds } } } },
          select: { itemTypeId: true, signedSoldier: { select: { companyId: true } } },
        })
      : Promise.resolve([] as { itemTypeId: string; signedSoldier: { companyId: string | null } | null }[]),
  ]);
  const map: Record<string, string[]> = {};
  const add = (h: string | null | undefined, it: string) => {
    if (!h) return;
    (map[h] ??= []);
    if (!map[h].includes(it)) map[h].push(it);
  };
  sb.forEach((r) => add(r.holderId, r.itemTypeId));
  su.forEach((r) => add(r.currentHolderId, r.itemTypeId));
  suComp.forEach((r) => add(r.signedSoldier?.companyId, r.itemTypeId));
  return map;
}
