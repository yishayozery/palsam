import { PrismaClient } from "../src/generated/prisma";
import * as XLSX from "xlsx";
import { nanoid } from "nanoid";
const p = new PrismaClient();

const FILE = "C:/Users/ASUS/Downloads/דוח צלמים 07.07 קרינה (1).xlsx";
const DRY_RUN = process.argv.includes("--commit") ? false : true;

// זיהוי עמודות לפי כותרת
const norm = (s: unknown) => String(s ?? "").replace(/["'.\s׳״]/g, "");
const digits = (v: unknown) => String(v ?? "").replace(/\.0+$/, "").replace(/\D/g, "");

async function main() {
  const bat = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true } });
  const armory = await p.holder.findFirst({ where: { battalionId: bat!.id, warehouseType: "ARMORY" }, select: { id: true } });
  const admin = await p.appUser.findFirst({ where: { battalionId: bat!.id, role: "BATTALION_ADMIN", active: true }, select: { id: true } });
  if (!admin) throw new Error("לא נמצא אדמין גדוד ליצירת התעודות");
  const wb = XLSX.readFile(FILE);

  type Rec = { pn: string; serial: string; sheet: string };
  const recs: Rec[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
    const hIdx = rows.findIndex((r) => r.some((c) => norm(c) === "מא"));
    if (hIdx < 0) continue; // גיליון ללא עמודת מ.א (למשל דף ריכוז)
    const header = rows[hIdx];
    const pnCol = header.findIndex((c) => norm(c) === "מא");
    // עמודות שאינן סריאליים: מ.א, טלפון, מ.ברזל, שם/משפחה/פלוגה, סוג נשק, בוחן
    const skip = new Set<number>();
    header.forEach((c, i) => { const t = norm(c); if (t.includes("טל") || t.includes("ברזל") || t.includes("שם") || t.includes("פלוגה") || t.includes("סוגנשק") || t.includes("בוחן")) skip.add(i); });
    skip.add(pnCol);
    for (const r of rows.slice(hIdx + 1)) {
      const pn = digits(r[pnCol]);
      if (pn.length < 6) continue;
      // כל תא שנראה כמו סריאלי (4+ ספרות) בעמודות שאינן חסומות — נצליב מול המערכת
      for (let c = 0; c < r.length; c++) {
        if (skip.has(c)) continue;
        const d = digits(r[c]);
        if (d.length >= 4) recs.push({ pn, serial: d, sheet: name });
      }
    }
  }
  console.log(`נקראו ${recs.length} רשומות מועמדות (מ.א+סריאלי) מהאקסל.`);

  // מיפוי חיילים + יחידות סריאליות
  const pns = [...new Set(recs.map((r) => r.pn))];
  const serials = [...new Set(recs.map((r) => r.serial))];
  const [soldiers, units] = await Promise.all([
    p.soldier.findMany({ where: { battalionId: bat!.id, personalNumber: { in: pns } }, select: { id: true, personalNumber: true, fullName: true } }),
    p.serialUnit.findMany({ where: { battalionId: bat!.id, serialNumber: { in: serials } }, select: { id: true, serialNumber: true, itemTypeId: true, statusId: true, lotQuantity: true, signedSoldierId: true } }),
  ]);
  const sByPn = new Map(soldiers.map((s) => [s.personalNumber!, s]));
  const uBySerial = new Map(units.map((u) => [u.serialNumber, u]));

  let toCreate: { rec: Rec; soldierId: string; unit: (typeof units)[number] }[] = [];
  const skipExisting: string[] = [], noSoldier: string[] = [], noSerial: string[] = [], signedOther: string[] = [];
  for (const r of recs) {
    const s = sByPn.get(r.pn); const u = uBySerial.get(r.serial);
    if (!s) { noSoldier.push(`${r.pn} (סריאלי ${r.serial})`); continue; }
    if (!u) { noSerial.push(`${r.serial} (מ.א ${r.pn})`); continue; }
    if (u.signedSoldierId === s.id) { skipExisting.push(r.serial); continue; }
    if (u.signedSoldierId && u.signedSoldierId !== s.id) { signedOther.push(`${r.serial} חתום על חייל אחר`); continue; }
    toCreate.push({ rec: r, soldierId: s.id, unit: u });
  }

  console.log(`\n=== סיכום ===`);
  console.log(`✅ חדשים להקמה: ${toCreate.length}`);
  console.log(`⏭️  כבר חתומים על אותו חייל: ${skipExisting.length}`);
  console.log(`⚠️  סריאלי חתום על חייל אחר: ${signedOther.length}`);
  console.log(`❓ חייל לא נמצא: ${noSoldier.length}`);
  console.log(`❓ סריאלי לא נמצא: ${noSerial.length}`);
  if (noSoldier.length) console.log(`   חיילים חסרים: ${noSoldier.slice(0, 15).join(", ")}${noSoldier.length > 15 ? " ..." : ""}`);
  if (noSerial.length) console.log(`   סריאליים חסרים: ${noSerial.slice(0, 15).join(", ")}${noSerial.length > 15 ? " ..." : ""}`);

  if (DRY_RUN) { console.log(`\n🔸 DRY RUN — לא נכתב כלום. הרץ עם --commit ליצירה.`); return; }

  // יצירת החתמות בדיעבד (signaturePending) — בלי שליחת בוט אוטומטית
  let created = 0;
  for (const t of toCreate) {
    const token = nanoid(24);
    await p.$transaction(async (tx) => {
      const transfer = await tx.transfer.create({
        data: { battalionId: bat!.id, type: "SIGNOUT", status: "COMPLETED", toSoldierId: t.soldierId, fromHolderId: armory?.id ?? null, createdById: admin.id, approvedAt: new Date(), signaturePending: true, notes: "החתמת נשק בדיעבד (ייבוא דוח)" },
      });
      await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId: t.unit.itemTypeId, quantity: t.unit.lotQuantity ?? 1, serialUnitId: t.unit.id, statusId: t.unit.statusId } });
      await tx.serialUnit.update({ where: { id: t.unit.id }, data: { signedSoldierId: t.soldierId } });
      await tx.signature.create({ data: { battalionId: bat!.id, soldierId: t.soldierId, transferId: transfer.id, method: "QR", status: "PENDING", token, tokenExpires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) } });
    });
    created++;
  }
  console.log(`\n✅ נוצרו ${created} החתמות נשק בדיעבד (ממתינות לחתימת החייל).`);
}
main().then(() => p.$disconnect()).catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
