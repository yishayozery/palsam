import { PrismaClient } from "../src/generated/prisma";
import * as XLSX from "xlsx";
const p = new PrismaClient();
const norm = (s: unknown) => String(s ?? "").replace(/["'.\s׳״]/g, "");
const digits = (v: unknown) => String(v ?? "").replace(/\.0+$/, "").replace(/\D/g, "");
async function main() {
  const bat = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true } });
  const wb = XLSX.readFile("C:/Users/ASUS/Downloads/דוח צלמים 07.07 קרינה (1).xlsx");
  const recs: { pn: string; serial: string }[] = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, blankrows: false });
    const hIdx = rows.findIndex((r) => r.some((c) => norm(c) === "מא")); if (hIdx < 0) continue;
    const header = rows[hIdx]; const pnCol = header.findIndex((c) => norm(c) === "מא");
    const skip = new Set<number>([pnCol]);
    header.forEach((c, i) => { const t = norm(c); if (t.includes("טל") || t.includes("ברזל") || t.includes("שם") || t.includes("פלוגה") || t.includes("סוגנשק") || t.includes("בוחן")) skip.add(i); });
    for (const r of rows.slice(hIdx + 1)) { const pn = digits(r[pnCol]); if (pn.length < 6) continue; for (let c = 0; c < r.length; c++) { if (skip.has(c)) continue; const d = digits(r[c]); if (d.length >= 4) recs.push({ pn, serial: d }); } }
  }
  const serials = [...new Set(recs.map(r => r.serial))];
  const [units, soldiers] = await Promise.all([
    p.serialUnit.findMany({ where: { battalionId: bat!.id, serialNumber: { in: serials } }, select: { serialNumber: true, itemType: { select: { name: true } }, signedSoldier: { select: { fullName: true, personalNumber: true } } } }),
    p.soldier.findMany({ where: { battalionId: bat!.id, personalNumber: { in: [...new Set(recs.map(r=>r.pn))] } }, select: { personalNumber: true, fullName: true } }),
  ]);
  const uBy = new Map(units.map(u => [u.serialNumber, u])); const sBy = new Map(soldiers.map(s => [s.personalNumber!, s]));
  console.log("=== 5 התנגשויות: נשק חתום במערכת על חייל אחר מהדוח ===");
  const seen = new Set<string>();
  for (const r of recs) {
    const u = uBy.get(r.serial); if (!u || !u.signedSoldier) continue;
    const reportS = sBy.get(r.pn); if (!reportS) continue;
    if (u.signedSoldier.personalNumber === r.pn) continue; // תואם
    if (seen.has(r.serial)) continue; seen.add(r.serial);
    console.log(`\n• ${u.itemType.name} סריאלי ${r.serial}`);
    console.log(`   לפי הדוח: ${reportS.fullName} (${r.pn})`);
    console.log(`   במערכת:  ${u.signedSoldier.fullName} (${u.signedSoldier.personalNumber})`);
  }
}
main().then(()=>p.$disconnect());
