import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TRANSFER_TYPE } from "@/lib/labels";
import { getWarehouseStateReport, getWarehouseMovementsReport } from "@/lib/warehouseReports";

export async function GET(req: Request) {
  const user = await getSession();
  if (!user || !user.battalionId) return new Response("Unauthorized", { status: 401 });
  const bId = user.battalionId;
  const url = new URL(req.url);
  const holderId = url.searchParams.get("warehouse") || "";
  const tab = url.searchParams.get("tab") === "movements" ? "movements" : "state";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || from;

  // אימות בעלות: המחסן חייב להיות בגדוד של המשתמש
  const wh = await prisma.holder.findFirst({ where: { id: holderId, battalionId: bId, kind: "WAREHOUSE" }, select: { name: true } });
  if (!wh) return new Response("Not found", { status: 404 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "מערכת ניהול מלאי גדודי";
  const today = new Date().toISOString().slice(0, 10);
  let filename = "";

  if (tab === "state") {
    const rep = await getWarehouseStateReport(bId, holderId);
    const ws = wb.addWorksheet("מצב מחסן", { views: [{ rightToLeft: true }] });
    ws.columns = [{ header: "פריט", key: "name", width: 30 }, ...rep.statuses.map((s) => ({ header: s.name, key: s.id, width: 12 })), { header: "סה״כ", key: "total", width: 12 }];
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    for (const r of rep.rows) {
      const row: Record<string, string | number> = { name: r.name, total: r.total };
      rep.statuses.forEach((s, i) => { row[s.id] = r.byStatus[i]; });
      ws.addRow(row);
    }
    const totalRow: Record<string, string | number> = { name: "סה״כ", total: rep.grandTotal };
    rep.statuses.forEach((s, i) => { totalRow[s.id] = rep.statusTotals[i]; });
    const tr = ws.addRow(totalRow); tr.font = { bold: true };
    filename = `state-${wh.name}-${today}.xlsx`;
  } else {
    const rep = await getWarehouseMovementsReport(bId, holderId, from, to);
    const ws = wb.addWorksheet("סיכום פר-פריט", { views: [{ rightToLeft: true }] });
    ws.columns = [{ header: "פריט", key: "name", width: 30 }, { header: "נכנס", key: "in", width: 12 }, { header: "יצא", key: "out", width: 12 }];
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    for (const r of rep.summaryRows) ws.addRow({ name: r.name, in: r.in, out: r.out });

    const ws2 = wb.addWorksheet("פירוט תנועות", { views: [{ rightToLeft: true }] });
    ws2.columns = [
      { header: "תאריך", key: "date", width: 12 }, { header: "שעה", key: "time", width: 8 },
      { header: "סוג", key: "type", width: 16 }, { header: "כיוון", key: "dir", width: 8 },
      { header: "פריט", key: "item", width: 28 }, { header: "סריאלי", key: "serial", width: 16 },
      { header: "כמות", key: "qty", width: 8 }, { header: "מול", key: "cp", width: 22 },
      { header: "סטטוס", key: "status", width: 12 }, { header: "בוצע ע״י", key: "by", width: 18 }, { header: "תעודה", key: "doc", width: 12 },
    ];
    ws2.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    ws2.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    for (const d of rep.detail) {
      ws2.addRow({
        date: d.time.toLocaleDateString("he-IL"), time: d.time.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
        type: TRANSFER_TYPE[d.type as keyof typeof TRANSFER_TYPE] ?? d.type, dir: d.dir === "in" ? "כניסה" : d.dir === "out" ? "יציאה" : "—",
        item: d.item, serial: d.serial ?? "—", qty: d.qty, cp: d.counterparty, status: d.status ?? "", by: d.by, doc: d.doc,
      });
    }
    filename = `movements-${wh.name}-${from}_${to}.xlsx`;
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="report-${today}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
