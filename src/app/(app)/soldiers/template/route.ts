import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";

export async function GET() {
  const user = await getSession();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("חיילים", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { header: "שם מלא", key: "name", width: 22 },
    { header: "מספר אישי", key: "pn", width: 16 },
    { header: "טלפון", key: "phone", width: 16 },
    { header: "פלוגה", key: "company", width: 18 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  ws.addRow({ name: "דני כהן", pn: "8000001", phone: "0501234567", company: "מפקדה/אגם" });
  ws.addRow({ name: "אבי לוי", pn: "8000002", phone: "0507654321", company: "פלהק" });

  const note = wb.addWorksheet("הוראות", { views: [{ rightToLeft: true }] });
  note.getCell("A1").value = "מלא שורה לכל חייל. עמודת 'פלוגה' נדרשת רק אם אינך משויך לפלוגה ספציפית.";
  note.getCell("A2").value = "שורת הכותרת חייבת להישאר. מספר אישי חוזר יעדכן חייל קיים.";

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="soldiers-template.xlsx"`,
    },
  });
}
