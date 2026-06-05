import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getSession();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const companies = user.battalionId
    ? await prisma.holder.findMany({ where: { battalionId: user.battalionId, kind: "COMPANY", active: true }, select: { name: true } })
    : [];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("חיילים", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { header: "שם פרטי *", key: "first", width: 18 },
    { header: "שם משפחה *", key: "last", width: 18 },
    { header: "פלוגה *", key: "company", width: 20 },
    { header: "מספר אישי", key: "pn", width: 14 },
    { header: "נייד", key: "phone", width: 14 },
    { header: "מחלקה", key: "platoon", width: 12 },
    { header: "אישור גיוס (כן/לא)", key: "enlist", width: 18 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };

  // דוגמאות לפי הפלוגות הקיימות
  const sampleNames = [
    { first: "דני", last: "כהן" },
    { first: "אבי", last: "לוי" },
    { first: "מיכאל", last: "מזרחי" },
  ];
  companies.slice(0, 3).forEach((c, i) => {
    const n = sampleNames[i];
    ws.addRow({ first: n.first, last: n.last, company: c.name, pn: `800000${i + 1}`, phone: "0501234567", platoon: "מחלקה 1", enlist: "כן" });
  });

  // אם אין פלוגות — שורת דוגמה גנרית
  if (companies.length === 0) {
    ws.addRow({ first: "דני", last: "כהן", company: "פלוגה א'", pn: "8000001", phone: "0501234567", platoon: "מחלקה 1", enlist: "כן" });
  }

  // עמוד הוראות
  const note = wb.addWorksheet("הוראות", { views: [{ rightToLeft: true }] });
  note.columns = [{ width: 60 }];
  note.getCell("A1").value = "תבנית ייבוא חיילים — שלישות";
  note.getCell("A1").font = { bold: true, size: 14 };
  note.getCell("A3").value = "שדות חובה: שם פרטי, שם משפחה, פלוגה.";
  note.getCell("A4").value = "פלוגה — חייב להיות שם בדיוק כמו שמופיע במערכת (מבנה ארגוני → פלוגות).";
  note.getCell("A6").value = "פלוגות זמינות בגדוד שלך:";
  note.getCell("A6").font = { bold: true };
  companies.forEach((c, i) => { note.getCell(`A${7 + i}`).value = `• ${c.name}`; });
  const after = 7 + companies.length + 1;
  note.getCell(`A${after}`).value = "מספר אישי — אופציונלי. אם הוזן, חייב להיות ייחודי בגדוד.";
  note.getCell(`A${after + 1}`).value = 'אישור גיוס — "כן" יסמן את החייל כמאושר לחתום על ציוד מיידית. ברירת מחדל: לא.';

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="roster-template.xlsx"`,
    },
  });
}
