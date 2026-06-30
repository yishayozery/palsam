import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TRANSFER_TYPE, TRANSFER_STATUS } from "@/lib/labels";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user || !user.battalionId) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "all"; // all | serial | lot | quantity
  const holder = url.searchParams.get("holder") || "";

  const item = await prisma.itemType.findFirst({ where: { id, battalionId: user.battalionId } });
  if (!item) return new Response("Not found", { status: 404 });

  const where = {
    itemTypeId: id,
    transfer: {
      battalionId: user.battalionId,
      ...(holder ? { OR: [{ fromHolderId: holder }, { toHolderId: holder }] } : {}),
    },
    ...(view === "serial" ? { serialUnitId: { not: null } } : view === "lot" ? { serialUnit: { lotQuantity: { not: null } } } : view === "quantity" ? { serialUnitId: null } : {}),
  };

  const lines = await prisma.transferLine.findMany({
    where,
    include: {
      transfer: { include: { fromHolder: true, toHolder: true, toSoldier: true, toUser: true, createdBy: true, approvedBy: true } },
      status: true, serialUnit: true,
    },
    orderBy: { transfer: { createdAt: "desc" } },
  });

  // ספירות מלאי על הפריט (תנועות פר תא ספירה)
  const countLines = await prisma.countLine.findMany({
    where: { itemTypeId: id, session: { battalionId: user.battalionId } },
    include: { session: { include: { startedBy: true } }, holder: true, serialUnit: true },
    orderBy: { session: { startedAt: "desc" } },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "מערכת ניהול מלאי גדודי";

  // === גיליון תנועות מלאי ===
  const ws = wb.addWorksheet("תנועות מלאי", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { header: "תאריך", key: "date", width: 14 },
    { header: "שעה", key: "time", width: 10 },
    { header: "סוג פעולה", key: "type", width: 22 },
    { header: "מאת", key: "from", width: 18 },
    { header: "אל", key: "to", width: 22 },
    { header: "מספר סריאלי/אצווה", key: "sn", width: 20 },
    { header: "כמות באצווה", key: "lotQty", width: 12 },
    { header: "כמות בשורה", key: "qty", width: 12 },
    { header: "סטטוס פריט", key: "status", width: 12 },
    { header: "סטטוס תעודה", key: "tstatus", width: 14 },
    { header: "בוצע ע״י", key: "by", width: 18 },
    { header: "אושר ע״י", key: "approver", width: 18 },
    { header: "סיבה/הערות", key: "reason", width: 30 },
    { header: "מס׳ תעודה", key: "doc", width: 12 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  for (const l of lines) {
    const t = l.transfer;
    ws.addRow({
      date: t.createdAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" }),
      time: t.createdAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" }),
      type: TRANSFER_TYPE[t.type],
      from: t.fromHolder?.name ?? "חטיבה",
      to: t.toHolder?.name ?? t.toSoldier?.fullName ?? t.toUser?.fullName ?? "חטיבה",
      sn: l.serialUnit?.serialNumber ?? "—",
      lotQty: l.serialUnit?.lotQuantity ?? "",
      qty: l.quantity,
      status: l.status?.name ?? "—",
      tstatus: TRANSFER_STATUS[t.status],
      by: t.createdBy.fullName,
      approver: t.approvedBy?.fullName ?? "—",
      reason: t.reason ?? t.notes ?? "",
      doc: t.id.slice(-8).toUpperCase(),
    });
  }

  // === גיליון ספירות מלאי ===
  if (countLines.length > 0) {
    const ws2 = wb.addWorksheet("ספירות מלאי", { views: [{ rightToLeft: true }] });
    ws2.columns = [
      { header: "תאריך ספירה", key: "date", width: 14 },
      { header: "סוג ספירה", key: "type", width: 16 },
      { header: "מחזיק", key: "holder", width: 18 },
      { header: "מספר סריאלי", key: "sn", width: 18 },
      { header: "כמות צפויה", key: "expected", width: 12 },
      { header: "כמות שנספרה", key: "counted", width: 12 },
      { header: "פער", key: "diff", width: 8 },
      { header: "בוצע ע״י", key: "by", width: 18 },
    ];
    ws2.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws2.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };

    for (const c of countLines) {
      ws2.addRow({
        date: c.session.startedAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" }),
        type: c.session.type,
        holder: c.holder?.name ?? "—",
        sn: c.serialUnit?.serialNumber ?? "—",
        expected: c.expectedQty,
        counted: c.countedQty ?? "—",
        diff: c.countedQty !== null ? (c.countedQty - c.expectedQty) : "—",
        by: c.session.startedBy.fullName,
      });
    }
  }

  // === גיליון פרטי פריט ===
  const ws3 = wb.addWorksheet("פרטי הפריט", { views: [{ rightToLeft: true }] });
  ws3.columns = [{ header: "שדה", key: "k", width: 20 }, { header: "ערך", key: "v", width: 40 }];
  ws3.addRow({ k: "שם", v: item.name });
  ws3.addRow({ k: "מק״ט", v: item.sku ?? "—" });
  ws3.addRow({ k: "שיטת ניהול", v: item.trackingMethod });
  ws3.addRow({ k: "יחידה", v: item.unit });
  ws3.addRow({ k: "שייכות", v: item.association });
  ws3.addRow({ k: "תאריך הקמה", v: item.createdAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" }) });

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="history-${item.sku ?? item.id.slice(-6)}.xlsx"`,
    },
  });
}
