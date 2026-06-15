import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * חישוב כמות נוכחית פר (פלוגה, פריט) - אגרגטיבי על כל הסטטוסים.
 * סופר: StockBalance של הפלוגה + SerialUnit אצל הפלוגה + SerialUnit חתום על חיילי הפלוגה
 *   + כמותי-חתום על חיילי הפלוגה (SIGNOUT - CHECKIN).
 *
 * החזרה: Map<itemTypeId, totalQuantity>.
 */
export async function getCompanyItemTotals(
  battalionId: string,
  companyId: string,
): Promise<Map<string, number>> {
  const soldiers = await prisma.soldier.findMany({
    where: { battalionId, companyId, active: true },
    select: { id: true },
  });
  const soldierIds = soldiers.map((s) => s.id);

  const [stockBalances, serialUnits, signedQtyLines] = await Promise.all([
    prisma.stockBalance.findMany({
      where: { battalionId, holderId: companyId, quantity: { gt: 0 } },
      select: { itemTypeId: true, quantity: true },
    }),
    prisma.serialUnit.findMany({
      where: {
        battalionId,
        OR: [
          { currentHolderId: companyId },
          ...(soldierIds.length > 0 ? [{ signedSoldierId: { in: soldierIds } }] : []),
        ],
      },
      select: { itemTypeId: true, lotQuantity: true },
    }),
    soldierIds.length === 0 ? Promise.resolve([] as { itemTypeId: string; quantity: number; transfer: { type: string } }[]) :
      prisma.transferLine.findMany({
        where: {
          transfer: { battalionId, status: "COMPLETED", type: { in: ["SIGNOUT", "CHECKIN"] }, toSoldierId: { in: soldierIds } },
          serialUnitId: null,
          itemType: { trackingMethod: "QUANTITY" },
        },
        select: { itemTypeId: true, quantity: true, transfer: { select: { type: true } } },
      }),
  ]);

  const agg = new Map<string, number>();
  for (const b of stockBalances) agg.set(b.itemTypeId, (agg.get(b.itemTypeId) ?? 0) + b.quantity);
  for (const u of serialUnits) agg.set(u.itemTypeId, (agg.get(u.itemTypeId) ?? 0) + (u.lotQuantity ?? 1));
  for (const l of signedQtyLines) {
    const sign = l.transfer.type === "SIGNOUT" ? 1 : -1;
    agg.set(l.itemTypeId, (agg.get(l.itemTypeId) ?? 0) + sign * l.quantity);
  }
  return agg;
}
