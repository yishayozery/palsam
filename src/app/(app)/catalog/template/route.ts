import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getSession();
  if (!user || !user.battalionId) return new Response("Unauthorized", { status: 401 });

  const cats = await prisma.category.findMany({
    where: { battalionId: user.battalionId, active: true },
    orderBy: { name: "asc" },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("פריטים", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { header: 'מק"ט', key: "sku", width: 14 },
    { header: "שם הפריט", key: "name", width: 24 },
    { header: "קטגוריה", key: "cat", width: 18 },
    { header: "שיטת ניהול", key: "method", width: 16 },
    { header: "יחידה", key: "unit", width: 10 },
    { header: "רגיש", key: "sensitive", width: 8 },
    { header: "מעקב מיקום", key: "loc", width: 12 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  const exampleCat = cats[0]?.name || "ציוד";
  ws.addRow({ sku: "HLMT", name: "קסדה", cat: exampleCat, method: "כמותי", unit: "יח'", sensitive: "לא", loc: "לא" });
  ws.addRow({ sku: "M4", name: "רובה M4", cat: cats.find((c) => c.name === "רובים")?.name || exampleCat, method: "פרטני", unit: "יח'", sensitive: "כן", loc: "כן" });

  const note = wb.addWorksheet("הוראות", { views: [{ rightToLeft: true }] });
  note.getCell("A1").value = "שיטת ניהול: כמותי / פרטני / אצווה / ערכה";
  note.getCell("A2").value = "רגיש ומעקב מיקום: כן / לא";
  note.getCell("A3").value = "הקטגוריה חייבת להתקיים במערכת (מסך מילונים). קטגוריות קיימות:";
  note.getCell("A4").value = cats.map((c) => c.name).join(", ") || "(אין — צור קטגוריות תחילה)";
  note.getCell("A5").value = 'מק"ט חוזר יעדכן פריט קיים.';

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="items-template.xlsx"`,
    },
  });
}
