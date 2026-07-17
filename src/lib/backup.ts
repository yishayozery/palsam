import { prisma } from "./prisma";
import { createHash } from "crypto";
import { gzipSync } from "zlib";
import { encryptSecret } from "./crypto";

// שרת בלבד. guard במקום "server-only" כדי שסקריפטי DR (גיבוי/שחזור) יוכלו לייבא.
if (typeof window !== "undefined") throw new Error("backup.ts is server-only");

/**
 * 📤 עותק off-site — שולח את ה-snapshot כצרופת מייל מוצפנת (ENCRYPTION_KEY),
 *    כדי שיהיה גיבוי מחוץ ל-Neon (נוחת בתיבת הדואר — נפרד לגמרי מ-DB ומ-Vercel).
 *    התהליך: gzip → base64 → הצפנת AES-256-GCM → צרופה. שקוף לכשל (לא שובר את הגיבוי ל-DB).
 *    היעד נקבע ע"י env BACKUP_EMAIL; אם חסר — מדלגים. שחזור: scripts/decrypt-backup.ts.
 */
async function sendOffsiteBackup(plain: string, ts: string): Promise<"sent" | "skipped" | "failed"> {
  const to = process.env.BACKUP_EMAIL;
  if (!to) return "skipped";
  try {
    const gz = gzipSync(Buffer.from(plain, "utf8")).toString("base64");
    const enc = encryptSecret(gz); // "v1:iv:tag:ct" — ASCII, ניתן לפענוח רק עם ENCRYPTION_KEY
    const attachment = { filename: `palmy-backup-${ts}.json.gz.enc`, content: Buffer.from(enc, "utf8").toString("base64") };
    const { sendEmail } = await import("./email"); // דינמי — email.ts הוא server-only ולא נטען בסקריפטי DR
    const r = await sendEmail({
      to,
      subject: `🗄️ גיבוי PALMY off-site — ${ts}`,
      text: `מצורף גיבוי מוצפן של מסד הנתונים (${(Buffer.byteLength(enc, "utf8") / 1024).toFixed(0)}KB).\nלשחזור: npx tsx scripts/decrypt-backup.ts <קובץ> (דורש ENCRYPTION_KEY של הפרודקשן).`,
      attachments: [attachment],
    });
    return r.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

/** טבלאות-הייחוס/קונפיג — משתנות נדיר. נלכדות בגיבוי רק כשהשתנו (גיבוי דינמי). */
async function fetchReferenceTables() {
  const [categories, itemStatuses, storageLocations, companyRoles, squads, attendanceStatuses] = await Promise.all([
    prisma.category.findMany({ select: { id: true, battalionId: true, name: true, warehouseType: true, active: true, sortOrder: true, maxPerSoldier: true } }),
    prisma.itemStatus.findMany({ select: { id: true, battalionId: true, name: true, isDefault: true, isLoss: true, isWear: true, isConsumed: true, sortOrder: true, active: true } }),
    prisma.storageLocation.findMany({ select: { id: true, holderId: true, column: true, row: true, label: true } }),
    prisma.companyRole.findMany({ select: { id: true, battalionId: true, companyId: true, name: true, isCommander: true, sortOrder: true, active: true } }),
    prisma.squad.findMany({ select: { id: true, battalionId: true, companyId: true, name: true, sortOrder: true, active: true } }),
    prisma.attendanceStatus.findMany({ select: { id: true, battalionId: true, name: true, color: true, icon: true, isPresent: true, sortOrder: true, active: true } }),
  ]);
  return { categories, itemStatuses, storageLocations, companyRoles, squads, attendanceStatuses };
}

/**
 * גיבוי לוגי של הנתונים הקריטיים (נשק, חתימות, שינועים, חיילים, מלאי).
 * נשמר כ-snapshot JSON ברשומת BackupRun (מגובה חיצונית ע"י Neon PITR).
 * לא כולל צילומי base64 כבדים (חתימות/רישיונות) — הם ב-Neon PITR ממילא.
 * ניתן להורדה מהמסך לשמירה מחוץ למערכת.
 */

const KEEP_DATA_RUNS = 6;   // נשמור את ה-JSON המלא רק ל-6 ריצות אחרונות (3 ימים)
const KEEP_META_RUNS = 90;  // מטא-דאטה (ללא data) — 90 ריצות אחרונות (~45 יום)

const DEDUPE_MINUTES = 30; // חלון מניעת-כפילות לריצות cron

/**
 * @param opts.force הפעלה ידנית מהמסך — תמיד רצה, בלי בדיקת כפילות.
 */
export async function runBackup(opts: { force?: boolean } = {}): Promise<{ id: string; status: string; sizeBytes: number }> {
  // 🔒 מניעת כפילות: 3 פרויקטי Vercel פורסים את אותו ריפו ויורים את אותו cron על אותו DB,
  //    אז כל גיבוי נוצר 3× (ועם off-site — 3 מיילים זהים). בדיקה תמימה "האם רץ לאחרונה"
  //    לא מספיקה — שלושתם יורים באותה שנייה ויעברו אותה לפני שמישהו הספיק לכתוב.
  //    לכן: advisory lock (מסדר בתור) + שורת-תפיסה RUNNING בתוך אותה טרנזקציה קצרה.
  let claimId: string | null = null;
  if (!opts.force) {
    claimId = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtextextended('palmy:backup:cron', 0))) _lock`;
      const recent = await tx.backupRun.findFirst({
        where: { createdAt: { gte: new Date(Date.now() - DEDUPE_MINUTES * 60_000) }, status: { in: ["OK", "RUNNING"] } },
        select: { id: true },
      });
      if (recent) return null; // מישהו כבר גיבה/מגבה עכשיו — מדלגים
      const claim = await tx.backupRun.create({ data: { status: "RUNNING", target: "DB" }, select: { id: true } });
      return claim.id;
    });
    if (!claimId) {
      console.log("[backup] דילוג — גיבוי אחר רץ/הסתיים בחלון האחרון (כפילות cron מ-3 הפרויקטים)");
      return { id: "", status: "SKIPPED_DUPLICATE", sizeBytes: 0 };
    }
  }

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
    const snapshot = { version: 2, tables };
    const json = JSON.stringify(snapshot);

    // 🔁 גיבוי דינמי של טבלאות-הייחוס: נלכדות רק כשה-hash השתנה מהריצה האחרונה.
    const reference = await fetchReferenceTables();
    const refJson = JSON.stringify(reference);
    const referenceHash = createHash("sha256").update(refJson).digest("hex");
    const last = await prisma.backupRun.findFirst({ where: { status: "OK", referenceHash: { not: null } }, orderBy: { createdAt: "desc" }, select: { referenceHash: true } });
    const refChanged = last?.referenceHash !== referenceHash;
    const referenceData = refChanged ? refJson : null; // ללא שינוי → לא משכפלים (חוסך מקום)
    Object.assign(rowCounts, Object.fromEntries(Object.entries(reference).map(([k, v]) => [`ref_${k}`, (v as unknown[]).length])));

    const sizeBytes = Buffer.byteLength(json, "utf8") + (referenceData ? Buffer.byteLength(referenceData, "utf8") : 0);

    // 📤 עותק off-site מוצפן (מייל) — self-contained: תמיד כולל את טבלאות-הייחוס
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const offsitePlain = JSON.stringify({ version: 2, tables, reference });
    const offsite = await sendOffsiteBackup(offsitePlain, ts);
    rowCounts._offsite = offsite === "sent" ? 1 : 0;

    const payload = { status: "OK", target: offsite === "sent" ? "DB+OFFSITE" : "DB", sizeBytes, rowCounts, data: json, referenceData, referenceHash };
    const run = claimId
      ? await prisma.backupRun.update({ where: { id: claimId }, data: payload, select: { id: true } })
      : await prisma.backupRun.create({ data: payload, select: { id: true } });
    await pruneBackups().catch(() => {});
    return { id: run.id, status: "OK", sizeBytes };
  } catch (e) {
    // כשל — מסמנים את שורת-התפיסה (או יוצרים חדשה בהרצה ידנית), כדי שלא תישאר תקועה RUNNING
    const err = e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500);
    const run = claimId
      ? await prisma.backupRun.update({ where: { id: claimId }, data: { status: "FAIL", error: err }, select: { id: true } }).catch(() => ({ id: claimId! }))
      : await prisma.backupRun.create({ data: { status: "FAIL", target: "DB", error: err }, select: { id: true } }).catch(() => ({ id: "unknown" }));
    return { id: run.id, status: "FAIL", sizeBytes: 0 };
  }
}

/** ניקוי: מוחק את ה-JSON הכבד (data) מריצות ישנות, אך שומר את referenceData (קטן,
 *  ולשמירת שרשרת השחזור הדינמי). מוחק מטא-דאטה מעבר לרף — למעט מחזיק-הייחוס הנוכחי. */
export async function pruneBackups(): Promise<void> {
  // מנקים רק את data הכבד (לא referenceData — הוא קטן ונחוץ לשחזור דינמי)
  const recent = await prisma.backupRun.findMany({ orderBy: { createdAt: "desc" }, select: { id: true }, take: KEEP_DATA_RUNS });
  const keepIds = recent.map((r) => r.id);
  if (keepIds.length) {
    await prisma.backupRun.updateMany({ where: { id: { notIn: keepIds }, data: { not: null } }, data: { data: null } });
  }
  // מחיקת מטא ישן — אך לעולם לא מוחקים את הריצה שמחזיקה את ה-referenceData העדכני (עוגן שחזור)
  const metaKeep = await prisma.backupRun.findMany({ orderBy: { createdAt: "desc" }, select: { id: true }, take: KEEP_META_RUNS });
  const metaIds = new Set(metaKeep.map((r) => r.id));
  const refAnchor = await prisma.backupRun.findFirst({ where: { referenceData: { not: null } }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (refAnchor) metaIds.add(refAnchor.id);
  if (metaIds.size) {
    await prisma.backupRun.deleteMany({ where: { id: { notIn: [...metaIds] } } });
  }
}
