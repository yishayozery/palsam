import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getSession();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "מערכת ניהול מלאי גדודי";

  // גיליון מלאי כמותי
  const qSheet = wb.addWorksheet("מלאי כמותי", { views: [{ rightToLeft: true }] });
  qSheet.columns = [
    { header: "פריט", key: "item", width: 24 },
    { header: 'מק"ט', key: "sku", width: 14 },
    { header: "קטגוריה", key: "cat", width: 16 },
    { header: "מחזיק", key: "holder", width: 18 },
    { header: "סטטוס", key: "status", width: 14 },
    { header: "כמות", key: "qty", width: 10 },
  ];
  const balances = await prisma.stockBalance.findMany({
    where: { quantity: { gt: 0 } },
    include: { itemType: { include: { category: true } }, holder: true, status: true },
  });
  for (const b of balances) {
    qSheet.addRow({
      item: b.itemType.name, sku: b.itemType.sku, cat: b.itemType.category.name,
      holder: b.holder.name, status: b.status.name, qty: b.quantity,
    });
  }

  // גיליון מלאי סריאלי
  const sSheet = wb.addWorksheet("מלאי סריאלי", { views: [{ rightToLeft: true }] });
  sSheet.columns = [
    { header: "פריט", key: "item", width: 24 },
    { header: "מספר סריאלי", key: "sn", width: 18 },
    { header: "קטגוריה", key: "cat", width: 16 },
    { header: "סטטוס", key: "status", width: 14 },
    { header: "מחזיק (מיקום)", key: "holder", width: 18 },
    { header: "חתום על (אחריות)", key: "signed", width: 18 },
    { header: "מיקום פיזי", key: "phys", width: 18 },
  ];
  const units = await prisma.serialUnit.findMany({
    include: { itemType: { include: { category: true } }, status: true, currentHolder: true, signedSoldier: true },
    orderBy: [{ itemType: { name: "asc" } }, { serialNumber: "asc" }],
  });
  for (const u of units) {
    sSheet.addRow({
      item: u.itemType.name, sn: u.serialNumber, cat: u.itemType.category.name,
      status: u.status.name, holder: u.currentHolder?.name ?? "במעבר",
      signed: u.signedSoldier?.fullName ?? "", phys: u.physicalLocation ?? "",
    });
  }

  // עיצוב כותרות
  for (const sheet of [qSheet, sSheet]) {
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="inventory-report.xlsx"`,
    },
  });
}
