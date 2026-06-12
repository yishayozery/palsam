import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TRANSFER_TYPE, TRANSFER_STATUS } from "@/lib/labels";

const DIRECTION: Record<string, "in" | "out"> = {
  INTAKE: "in", RETURN: "in", CHECKIN: "in",
  WRITE_OFF: "out", ISSUE: "out", SIGNOUT: "out",
};

export async function GET(req: Request) {
  const user = await getSession();
  if (!user || !user.battalionId) return new Response("Unauthorized", { status: 401 });
  const bId = user.battalionId;
  const url = new URL(req.url);
  const item = (url.searchParams.get("item") || "").trim();
  const soldier = (url.searchParams.get("soldier") || "").trim();
  const doc = (url.searchParams.get("doc") || "").trim();
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const type = (url.searchParams.get("type") || "").trim();
  const direction = (url.searchParams.get("direction") || "").trim();

  const isWM = user.role === "WAREHOUSE_MANAGER" && user.holderIds.length > 0;
  const isCR = user.role === "COMPANY_REP" && user.holderId;
  const scopeFilter = isWM
    ? { OR: [{ fromHolderId: { in: user.holderIds } }, { toHolderId: { in: user.holderIds } }] }
    : isCR
      ? { OR: [{ fromHolderId: user.holderId! }, { toHolderId: user.holderId! }, { toSoldier: { companyId: user.holderId! } }] }
      : {};

  const lineFilter = item ? {
    lines: { some: { itemType: { OR: [{ name: { contains: item, mode: "insensitive" as const } }, { sku: { contains: item, mode: "insensitive" as const } }] } } },
  } : {};
  const soldierFilter = soldier ? {
    OR: [
      { toSoldier: { fullName: { contains: soldier, mode: "insensitive" as const } } },
      { toSoldier: { personalNumber: { contains: soldier } } },
      { signatures: { some: { soldier: { OR: [{ fullName: { contains: soldier, mode: "insensitive" as const } }, { personalNumber: { contains: soldier } }] } } } },
    ],
  } : {};
  const docFilter = doc ? { id: { endsWith: doc.toLowerCase() } } : {};
  const typeFilter = type ? { type: type as "INTAKE" | "WRITE_OFF" | "ISSUE" | "RETURN" | "SIGNOUT" | "CHECKIN" } : {};
  const directionTypes = direction === "in"
    ? ["INTAKE", "RETURN", "CHECKIN"]
    : direction === "out"
      ? ["WRITE_OFF", "ISSUE", "SIGNOUT"]
      : null;
  const directionFilter = directionTypes ? { type: { in: directionTypes as ("INTAKE" | "WRITE_OFF" | "ISSUE" | "RETURN" | "SIGNOUT" | "CHECKIN")[] } } : {};
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (from) dateFilter.gte = new Date(from);
  if (to) { const end = new Date(to); end.setHours(23, 59, 59, 999); dateFilter.lte = end; }

  const transfers = await prisma.transfer.findMany({
    where: {
      battalionId: bId,
      ...scopeFilter, ...lineFilter, ...soldierFilter, ...docFilter, ...typeFilter, ...directionFilter,
      ...(from || to ? { createdAt: dateFilter } : {}),
    },
    include: {
      fromHolder: { select: { name: true } },
      toHolder: { select: { name: true } },
      toSoldier: { select: { fullName: true, personalNumber: true } },
      toUser: { select: { fullName: true } },
      createdBy: { select: { fullName: true } },
      approvedBy: { select: { fullName: true } },
      lines: { include: { itemType: { select: { name: true, sku: true, unit: true } }, status: true, serialUnit: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "מערכת ניהול מלאי גדודי";

  // גיליון תעודות (סיכום)
  const ws = wb.addWorksheet("תעודות", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { header: "תאריך", key: "date", width: 12 },
    { header: "שעה", key: "time", width: 8 },
    { header: "סוג", key: "type", width: 18 },
    { header: "כיוון", key: "dir", width: 8 },
    { header: "מאת", key: "from", width: 22 },
    { header: "אל", key: "to", width: 22 },
    { header: "מ.א.", key: "pn", width: 12 },
    { header: "פריטים (שורות)", key: "lines", width: 14 },
    { header: "סה״כ כמות", key: "qty", width: 12 },
    { header: "בוצע ע״י", key: "by", width: 18 },
    { header: "אושר ע״י", key: "approver", width: 18 },
    { header: "סטטוס תעודה", key: "status", width: 14 },
    { header: "מס׳ תעודה", key: "doc", width: 12 },
    { header: "הערות", key: "notes", width: 30 },
  ];
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  for (const t of transfers) {
    const dir = DIRECTION[t.type];
    const totalQty = t.lines.reduce((s, l) => s + (l.quantity || (l.serialUnit?.lotQuantity ?? 1)), 0);
    ws.addRow({
      date: t.createdAt.toLocaleDateString("he-IL"),
      time: t.createdAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
      type: TRANSFER_TYPE[t.type],
      dir: dir === "in" ? "כניסה" : dir === "out" ? "יציאה" : "—",
      from: t.fromHolder?.name ?? t.externalUnit ?? "—",
      to: t.toSoldier?.fullName ?? t.toHolder?.name ?? t.toUser?.fullName ?? "—",
      pn: t.toSoldier?.personalNumber ?? t.recipientPersonalId ?? "",
      lines: t.lines.length,
      qty: totalQty,
      by: t.createdBy.fullName,
      approver: t.approvedBy?.fullName ?? "",
      status: TRANSFER_STATUS[t.status],
      doc: t.id.slice(-8).toUpperCase(),
      notes: t.reason ?? t.notes ?? "",
    });
  }

  // גיליון שורות (מפורט)
  const ws2 = wb.addWorksheet("שורות תעודה", { views: [{ rightToLeft: true }] });
  ws2.columns = [
    { header: "תאריך", key: "date", width: 12 },
    { header: "שעה", key: "time", width: 8 },
    { header: "סוג", key: "type", width: 18 },
    { header: "כיוון", key: "dir", width: 8 },
    { header: "מאת", key: "from", width: 22 },
    { header: "אל", key: "to", width: 22 },
    { header: "פריט", key: "item", width: 28 },
    { header: "מק״ט", key: "sku", width: 14 },
    { header: "סריאלי/אצווה", key: "sn", width: 18 },
    { header: "כמות באצווה", key: "lotQty", width: 12 },
    { header: "כמות בשורה", key: "qty", width: 12 },
    { header: "יחידה", key: "unit", width: 10 },
    { header: "סטטוס פריט", key: "istatus", width: 12 },
    { header: "מס׳ תעודה", key: "doc", width: 12 },
  ];
  ws2.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  ws2.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  for (const t of transfers) {
    const dir = DIRECTION[t.type];
    for (const l of t.lines) {
      ws2.addRow({
        date: t.createdAt.toLocaleDateString("he-IL"),
        time: t.createdAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
        type: TRANSFER_TYPE[t.type],
        dir: dir === "in" ? "כניסה" : dir === "out" ? "יציאה" : "—",
        from: t.fromHolder?.name ?? t.externalUnit ?? "—",
        to: t.toSoldier?.fullName ?? t.toHolder?.name ?? t.toUser?.fullName ?? "—",
        item: l.itemType.name,
        sku: l.itemType.sku ?? "",
        sn: l.serialUnit?.serialNumber ?? "—",
        lotQty: l.serialUnit?.lotQuantity ?? "",
        qty: l.quantity,
        unit: l.itemType.unit,
        istatus: l.status?.name ?? "",
        doc: t.id.slice(-8).toUpperCase(),
      });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const today = new Date().toISOString().slice(0, 10);
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="history-${today}.xlsx"`,
    },
  });
}
