/**
 * 🔁 DR drill — שחזור נתוני גדוד מהגיבוי (BackupRun האחרון) לתוך גדוד ריק.
 * מדמה התאוששות מאסון: קורא את ה-snapshot, מסנן גדוד-מקור, ומשחזר לגדוד-יעד עם
 * מיפוי מלא של מזהי-FK. מדווח מה שוחזר ומה הוצרך תחליף (טבלאות-ייחוס שחסרות בגיבוי).
 *
 *   npx tsx --env-file=.env scripts/restore-into-battalion.ts <SRC_CODE> <DST_CODE>
 *   דוגמה: ... 21 22   (משחזר את נתוני גדוד 21 לתוך גדוד 22 הריק)
 */
import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();

type Row = Record<string, unknown>;

async function main() {
  const [srcCode, dstCode] = process.argv.slice(2);
  if (!srcCode || !dstCode) throw new Error("שימוש: restore-into-battalion <SRC_CODE> <DST_CODE>");

  const src = await p.battalion.findFirst({ where: { code: srcCode }, select: { id: true, name: true } });
  const dst = await p.battalion.findFirst({ where: { code: dstCode }, select: { id: true, name: true } });
  if (!src || !dst) throw new Error("גדוד מקור/יעד לא נמצא");
  const dstSoldiers = await p.soldier.count({ where: { battalionId: dst.id } });
  if (dstSoldiers > 0) throw new Error(`גדוד היעד (${dst.name}) אינו ריק (${dstSoldiers} חיילים) — עצירה למניעת ערבוב נתונים`);

  const backup = await p.backupRun.findFirst({ where: { status: "OK", data: { not: null } }, orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true, data: true, referenceData: true, referenceHash: true } });
  if (!backup?.data) throw new Error("אין גיבוי עם data");
  const snap = JSON.parse(backup.data) as { tables: Record<string, Row[]> };
  const t = snap.tables;
  const bySrc = (rows: Row[]) => rows.filter((r) => r.battalionId === src.id);

  // 🔁 גיבוי דינמי: אם ל-run אין referenceData (זהה לקודם) — מאתרים את העוגן עם אותו hash
  let refRaw = backup.referenceData;
  if (!refRaw && backup.referenceHash) {
    const anchor = await p.backupRun.findFirst({ where: { referenceHash: backup.referenceHash, referenceData: { not: null } }, orderBy: { createdAt: "desc" }, select: { referenceData: true } });
    refRaw = anchor?.referenceData ?? null;
  }
  const ref = refRaw ? (JSON.parse(refRaw) as Record<string, Row[]>) : null;

  console.log(`🔁 שחזור מגיבוי ${backup.createdAt.toISOString().slice(0,16)} | ${src.name} → ${dst.name}`);
  console.log(`   טבלאות-ייחוס: ${ref ? "✅ מהגיבוי (שחזור נאמן)" : "⚠️ חסרות → תחליף"}\n`);

  const dstStatusDefault = await p.itemStatus.findFirst({ where: { battalionId: dst.id, isDefault: true }, select: { id: true } });
  if (!dstStatusDefault) throw new Error("אין סטטוס ברירת-מחדל ביעד");
  const subs: string[] = [];

  // שחזור טבלאות-ייחוס מהגיבוי → מפות
  const catMap = new Map<string, string>();
  const statusMap = new Map<string, string>();
  if (ref) {
    // find-or-create לפי שם — מכבד טבלאות-ייחוס שכבר קיימות ביעד (כמו סטטוס ברירת-מחדל)
    for (const c of (ref.categories ?? []).filter((r) => r.battalionId === src.id)) {
      const existing = await p.category.findFirst({ where: { battalionId: dst.id, name: String(c.name) }, select: { id: true } });
      const nc = existing ?? await p.category.create({ data: { battalionId: dst.id, name: String(c.name), warehouseType: (c.warehouseType as string) as never, active: c.active as boolean, sortOrder: (c.sortOrder as number) ?? 0, maxPerSoldier: (c.maxPerSoldier as number | null) } });
      catMap.set(c.id as string, nc.id);
    }
    for (const s of (ref.itemStatuses ?? []).filter((r) => r.battalionId === src.id)) {
      const existing = await p.itemStatus.findFirst({ where: { battalionId: dst.id, name: String(s.name) }, select: { id: true } });
      const ns = existing ?? await p.itemStatus.create({ data: { battalionId: dst.id, name: String(s.name), isDefault: false, isLoss: s.isLoss as boolean, isWear: s.isWear as boolean, isConsumed: s.isConsumed as boolean, sortOrder: (s.sortOrder as number) ?? 0, active: s.active as boolean } });
      statusMap.set(s.id as string, ns.id);
    }
  } else {
    subs.push("Category/ItemStatus חסרים בגיבוי → תחליף מברירת-מחדל");
  }
  const restoreCat = ref ? null : await p.category.create({ data: { battalionId: dst.id, name: "שוחזר מגיבוי (בדיקה)", warehouseType: "EQUIPMENT" } });
  const mapStatus = (old: string | null) => (old && statusMap.get(old)) || dstStatusDefault.id;
  const mapCat = (old: string | null) => (old && catMap.get(old)) || restoreCat!.id;

  // 1) holders
  const holderMap = new Map<string, string>();
  for (const h of bySrc(t.holders)) {
    const nh = await p.holder.create({ data: { battalionId: dst.id, name: String(h.name), kind: h.kind as "WAREHOUSE" | "COMPANY", warehouseType: (h.warehouseType as string | null) as never, active: h.active as boolean } });
    holderMap.set(h.id as string, nh.id);
  }

  // 2) itemTypes
  const itemMap = new Map<string, string>();
  for (const it of bySrc(t.itemTypes)) {
    const ni = await p.itemType.create({ data: { battalionId: dst.id, name: String(it.name), sku: (it.sku as string | null) ?? `RST-${Math.floor(Math.random()*1e6)}`, categoryId: mapCat(it.categoryId as string), trackingMethod: it.trackingMethod as never, active: it.active as boolean } });
    itemMap.set(it.id as string, ni.id);
  }

  // 3) soldiers (createMany + מיפוי לפי personalNumber)
  const srcSoldiers = bySrc(t.soldiers);
  await p.soldier.createMany({ data: srcSoldiers.map((s) => ({
    battalionId: dst.id, fullName: String(s.fullName), firstName: (s.firstName as string | null), lastName: (s.lastName as string | null),
    personalNumber: (s.personalNumber as string | null), phone: (s.phone as string | null),
    companyId: s.companyId ? holderMap.get(s.companyId as string) ?? null : null,
    status: s.status as never, dischargedAt: s.dischargedAt ? new Date(s.dischargedAt as string) : null,
  })) });
  const newSoldiers = await p.soldier.findMany({ where: { battalionId: dst.id }, select: { id: true, personalNumber: true } });
  const pnToNew = new Map(newSoldiers.map((s) => [s.personalNumber, s.id]));
  const soldierMap = new Map<string, string>();
  for (const s of srcSoldiers) if (s.personalNumber) soldierMap.set(s.id as string, pnToNew.get(s.personalNumber as string)!);

  // 4) serialUnits (createMany)
  const srcUnits = bySrc(t.serialUnits);
  await p.serialUnit.createMany({ data: srcUnits.map((u) => ({
    battalionId: dst.id, itemTypeId: itemMap.get(u.itemTypeId as string)!, serialNumber: String(u.serialNumber),
    statusId: mapStatus(u.statusId as string), currentHolderId: u.currentHolderId ? holderMap.get(u.currentHolderId as string) ?? null : null,
    signedSoldierId: u.signedSoldierId ? soldierMap.get(u.signedSoldierId as string) ?? null : null,
    lotQuantity: (u.lotQuantity as number | null), dischargedAt: u.dischargedAt ? new Date(u.dischargedAt as string) : null,
  })).filter((r) => r.itemTypeId) });

  // 5) stockBalances (createMany)
  const srcStock = bySrc(t.stockBalances);
  await p.stockBalance.createMany({ data: srcStock.map((sb) => ({
    battalionId: dst.id, itemTypeId: itemMap.get(sb.itemTypeId as string)!, holderId: holderMap.get(sb.holderId as string)!,
    statusId: mapStatus(sb.statusId as string), quantity: sb.quantity as number,
  })).filter((r) => r.itemTypeId && r.holderId) });

  // אימות
  const [dHolders, dItems, dSol, dUnits, dStock] = await Promise.all([
    p.holder.count({ where: { battalionId: dst.id, id: { in: [...holderMap.values()] } } }),
    p.itemType.count({ where: { battalionId: dst.id } }),
    p.soldier.count({ where: { battalionId: dst.id } }),
    p.serialUnit.count({ where: { battalionId: dst.id } }),
    p.stockBalance.count({ where: { battalionId: dst.id } }),
  ]);
  const exp = { holders: bySrc(t.holders).length, itemTypes: srcSoldiers && bySrc(t.itemTypes).length, soldiers: srcSoldiers.length, serialUnits: srcUnits.length, stockBalances: srcStock.length };
  const chk = (a: number, b: number) => a === b ? "✅" : `❌ (צפוי ${b})`;
  console.log("שוחזר לגדוד היעד:");
  console.log(`  holders:      ${dHolders}  ${chk(dHolders, exp.holders)}`);
  console.log(`  itemTypes:    ${dItems}  ${chk(dItems, exp.itemTypes as number)}`);
  console.log(`  soldiers:     ${dSol}  ${chk(dSol, exp.soldiers)}`);
  console.log(`  serialUnits:  ${dUnits}  ${chk(dUnits, exp.serialUnits)}`);
  console.log(`  stockBalances:${dStock}  ${chk(dStock, exp.stockBalances)}`);
  const allOk = dHolders === exp.holders && dSol === exp.soldiers && dUnits === exp.serialUnits && dStock === exp.stockBalances;
  console.log(`\n${allOk ? "🎯 ✅ השחזור שלם — כל הספירות תואמות." : "🛑 ❌ אי-התאמה בספירות."}`);
  console.log("תחליפים (מגבלות הגיבוי):"); subs.forEach((s) => console.log(`  • ${s}`));
  console.log(`\nℹ️ לניקוי היעד: מחק את כל הנתונים של גדוד ${dstCode}.`);
}
main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => p.$disconnect());
