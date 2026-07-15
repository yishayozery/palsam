import { prisma } from "./prisma";

// שרת בלבד. guard במקום "server-only" כדי שסקריפטי DR (גיבוי/שחזור) יוכלו לייבא.
if (typeof window !== "undefined") throw new Error("backup.ts is server-only");

/**
 * גיבוי לוגי של הנתונים הקריטיים (נשק, חתימות, שינועים, חיילים, מלאי).
 * נשמר כ-snapshot JSON ברשומת BackupRun (מגובה חיצונית ע"י Neon PITR).
 * לא כולל צילומי base64 כבדים (חתימות/רישיונות) — הם ב-Neon PITR ממילא.
 * ניתן להורדה מהמסך לשמירה מחוץ למערכת.
 */

const KEEP_DATA_RUNS = 6;   // נשמור את ה-JSON המלא רק ל-6 ריצות אחרונות (3 ימים)
const KEEP_META_RUNS = 90;  // מטא-דאטה (ללא data) — 90 ריצות אחרונות (~45 יום)

export async function runBackup(): Promise<{ id: string; status: string; sizeBytes: number }> {
  try {
    const [serialUnits, signatures, transfers, transferLines, soldiers, holders, stockBalances, itemTypes, battalions, callups] = await Promise.all([
      prisma.serialUnit.findMany({ select: { id: true, battalionId: true, itemTypeId: true, serialNumber: true, statusId: true, currentHolderId: true, signedSoldierId: true, lotQuantity: true, dischargedAt: true, createdAt: true } }),
      prisma.signature.findMany({ select: { id: true, battalionId: true, soldierId: true, signerUserId: true, transferId: true, method: true, status: true, signerPersonalId: true, signedAt: true, createdAt: true } }),
      prisma.transfer.findMany({ select: { id: true, battalionId: true, type: true, status: true, fromHolderId: true, toHolderId: true, toSoldierId: true, externalUnit: true, createdById: true, approvedById: true, notes: true, createdAt: true } }),
      prisma.transferLine.findMany({ select: { id: true, transferId: true, itemTypeId: true, quantity: true, serialUnitId: true, kitInstanceId: true, statusId: true } }),
      prisma.soldier.findMany({ select: { id: true, battalionId: true, fullName: true, firstName: true, lastName: true, personalNumber: true, phone: true, companyId: true, companyRoleId: true, status: true, dischargedAt: true } }),
      prisma.holder.findMany({ select: { id: true, battalionId: true, name: true, kind: true, warehouseType: true, active: true } }),
      prisma.stockBalance.findMany({ select: { id: true, battalionId: true, itemTypeId: true, holderId: true, statusId: true, equipmentLocationId: true, quantity: true } }),
      prisma.itemType.findMany({ select: { id: true, battalionId: true, name: true, sku: true, categoryId: true, trackingMethod: true, active: true } }),
      prisma.battalion.findMany({ select: { id: true, name: true, code: true } }),
      prisma.callupPeriod.findMany({ select: { id: true, soldierId: true, startDate: true, endDate: true } }),
    ]);

    const tables = { serialUnits, signatures, transfers, transferLines, soldiers, holders, stockBalances, itemTypes, battalions, callups };
    const rowCounts: Record<string, number> = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, (v as unknown[]).length]));
    const snapshot = { version: 1, tables };
    const json = JSON.stringify(snapshot);
    const sizeBytes = Buffer.byteLength(json, "utf8");

    const run = await prisma.backupRun.create({
      data: { status: "OK", target: "DB", sizeBytes, rowCounts, data: json },
    });
    await pruneBackups().catch(() => {});
    return { id: run.id, status: "OK", sizeBytes };
  } catch (e) {
    const run = await prisma.backupRun.create({
      data: { status: "FAIL", target: "DB", error: e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500) },
    }).catch(() => ({ id: "unknown" }));
    return { id: run.id, status: "FAIL", sizeBytes: 0 };
  }
}

/** ניקוי: מוחק את ה-JSON הכבד מריצות ישנות, ומוחק מטא-דאטה מעבר לרף. */
export async function pruneBackups(): Promise<void> {
  const recent = await prisma.backupRun.findMany({ orderBy: { createdAt: "desc" }, select: { id: true }, take: KEEP_DATA_RUNS });
  const keepIds = recent.map((r) => r.id);
  if (keepIds.length) {
    await prisma.backupRun.updateMany({ where: { id: { notIn: keepIds }, data: { not: null } }, data: { data: null } });
  }
  const metaKeep = await prisma.backupRun.findMany({ orderBy: { createdAt: "desc" }, select: { id: true }, take: KEEP_META_RUNS });
  const metaIds = metaKeep.map((r) => r.id);
  if (metaIds.length) {
    await prisma.backupRun.deleteMany({ where: { id: { notIn: metaIds } } });
  }
}
