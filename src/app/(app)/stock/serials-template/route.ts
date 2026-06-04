import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";

export async function GET() {
  const user = await getSession();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("סריאליים", { views: [{ rightToLeft: true }] });
  ws.columns = [{ header: "מספר סריאלי", key: "sn", width: 24 }];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  ws.addRow({ sn: "M4-1001" });
  ws.addRow({ sn: "M4-1002" });
  ws.addRow({ sn: "M4-1003" });

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="serials-template.xlsx"' } });
}
