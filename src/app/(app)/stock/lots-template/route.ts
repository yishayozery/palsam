import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";

export async function GET() {
  const user = await getSession();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("אצוות", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { header: "מספר אצווה", key: "sn", width: 22 },
    { header: "כמות באצווה", key: "qty", width: 14 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  ws.addRow({ sn: "GREN-2026-A", qty: 25 });
  ws.addRow({ sn: "GREN-2026-B", qty: 50 });

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="lots-template.xlsx"' } });
}
