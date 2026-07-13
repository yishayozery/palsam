import { prisma } from "@/lib/prisma";

/**
 * מצב מחסן — כמות פר סוג-פריט × סטטוס, למחסן נתון.
 * כולל מלאי סריאלי לא-חתום (במחסן) + יתרות כמותיות. לא כולל ציוד חתום על חיילים.
 */
export async function getWarehouseStateReport(battalionId: string, holderId: string) {
  const [statuses, serialGroups, balances] = await Promise.all([
    prisma.itemStatus.findMany({ where: { battalionId }, select: { id: true, name: true }, orderBy: { id: "asc" } }),
    prisma.serialUnit.groupBy({
      by: ["itemTypeId", "statusId"],
      where: { battalionId, currentHolderId: holderId, signedSoldierId: null, dischargedAt: null },
      _sum: { lotQuantity: true },
      _count: { _all: true },
    }),
    prisma.stockBalance.groupBy({
      by: ["itemTypeId", "statusId"],
      where: { battalionId, holderId, quantity: { gt: 0 } },
      _sum: { quantity: true },
    }),
  ]);

  const typeIds = new Set<string>();
  const cell = new Map<string, number>(); // `${itemTypeId}|${statusId}` → qty
  const add = (itemTypeId: string, statusId: string | null, qty: number) => {
    if (!statusId || qty <= 0) return;
    typeIds.add(itemTypeId);
    const k = `${itemTypeId}|${statusId}`;
    cell.set(k, (cell.get(k) ?? 0) + qty);
  };
  for (const g of serialGroups) add(g.itemTypeId, g.statusId, g._sum.lotQuantity ?? g._count._all);
  for (const b of balances) add(b.itemTypeId, b.statusId, b._sum.quantity ?? 0);

  const types = await prisma.itemType.findMany({ where: { id: { in: [...typeIds] } }, select: { id: true, name: true } });
  const rows = types
    .map((t) => ({
      itemTypeId: t.id,
      name: t.name,
      byStatus: statuses.map((s) => cell.get(`${t.id}|${s.id}`) ?? 0),
      total: statuses.reduce((sum, s) => sum + (cell.get(`${t.id}|${s.id}`) ?? 0), 0),
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const statusTotals = statuses.map((_, i) => rows.reduce((sum, r) => sum + r.byStatus[i], 0));
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);
  return { statuses, rows, statusTotals, grandTotal };
}

const IN_TYPES = ["INTAKE", "RETURN", "CHECKIN", "EXTERNAL_IN"] as const;
const OUT_TYPES = ["ISSUE", "SIGNOUT", "WRITE_OFF", "EXTERNAL_OUT"] as const;

/**
 * סיכום תנועות יומי — כל התנועות שבהן המחסן צד (מקור/יעד) בטווח תאריכים.
 * מחזיר: סיכום פר-פריט (נכנס/יצא) + פירוט שורה-שורה.
 */
export async function getWarehouseMovementsReport(battalionId: string, holderId: string, fromYmd: string, toYmd: string) {
  const gte = new Date(`${fromYmd}T00:00:00.000`);
  const lte = new Date(`${toYmd}T23:59:59.999`);
  const transfers = await prisma.transfer.findMany({
    where: {
      battalionId, status: "COMPLETED",
      createdAt: { gte, lte },
      OR: [{ fromHolderId: holderId }, { toHolderId: holderId }],
    },
    select: {
      id: true, type: true, createdAt: true,
      fromHolder: { select: { name: true } },
      toHolder: { select: { name: true } },
      toSoldier: { select: { fullName: true, personalNumber: true } },
      createdBy: { select: { fullName: true } },
      lines: { select: { quantity: true, itemType: { select: { id: true, name: true } }, serialUnit: { select: { serialNumber: true, lotQuantity: true } }, status: { select: { name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  const dir = (type: string): "in" | "out" | null =>
    (IN_TYPES as readonly string[]).includes(type) ? "in" : (OUT_TYPES as readonly string[]).includes(type) ? "out" : null;

  // סיכום פר-פריט
  const summary = new Map<string, { name: string; in: number; out: number }>();
  const detail: { time: Date; dir: "in" | "out" | null; type: string; item: string; serial: string | null; qty: number; counterparty: string; status: string | null; by: string; doc: string }[] = [];
  for (const t of transfers) {
    const d = dir(t.type);
    const counterparty = t.toSoldier?.fullName ?? t.toHolder?.name ?? t.fromHolder?.name ?? "—";
    for (const l of t.lines) {
      const qty = l.quantity || (l.serialUnit?.lotQuantity ?? 1);
      const s = summary.get(l.itemType.id) ?? { name: l.itemType.name, in: 0, out: 0 };
      if (d === "in") s.in += qty; else if (d === "out") s.out += qty;
      summary.set(l.itemType.id, s);
      detail.push({ time: t.createdAt, dir: d, type: t.type, item: l.itemType.name, serial: l.serialUnit?.serialNumber ?? null, qty, counterparty, status: l.status?.name ?? null, by: t.createdBy.fullName, doc: t.id.slice(-8).toUpperCase() });
    }
  }
  const summaryRows = [...summary.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { summaryRows, detail, totalIn: summaryRows.reduce((s, r) => s + r.in, 0), totalOut: summaryRows.reduce((s, r) => s + r.out, 0), count: transfers.length };
}
