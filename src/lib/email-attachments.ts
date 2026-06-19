import "server-only";
import ExcelJS from "exceljs";
import { prisma } from "./prisma";
import { TRANSFER_TYPE, TRANSFER_STATUS } from "./labels";

type TransferWithDetails = NonNullable<Awaited<ReturnType<typeof loadTransfer>>>;

async function loadTransfer(transferId: string) {
  return prisma.transfer.findUnique({
    where: { id: transferId },
    include: {
      battalion: { select: { name: true, code: true } },
      fromHolder: { select: { name: true } },
      toHolder: { select: { name: true } },
      toSoldier: { select: { fullName: true, personalNumber: true } },
      createdBy: { select: { fullName: true } },
      approvedBy: { select: { fullName: true } },
      lines: {
        include: {
          itemType: { select: { name: true, sku: true, unit: true } },
          serialUnit: { select: { serialNumber: true, lotQuantity: true } },
          status: { select: { name: true } },
        },
      },
    },
  });
}

function buildHtml(t: TransferWithDetails): string {
  const docNumber = t.id.slice(-8).toUpperCase();
  const unitName = t.battalion?.name || "גדוד";
  const dateStr = t.createdAt.toLocaleDateString("he-IL");
  const timeStr = t.createdAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  const fromName = t.fromHolder?.name ?? "חטיבה (גורם חיצוני)";
  const toName = t.toSoldier?.fullName ?? t.toHolder?.name ?? "—";
  const totalQty = t.lines.reduce((s, l) => s + (l.quantity || (l.serialUnit?.lotQuantity ?? 1)), 0);

  const rows = t.lines.map((l, i) => `
    <tr>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;text-align:center">${i + 1}</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px">${l.itemType.name}</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;font-family:monospace;font-size:12px">${l.serialUnit?.serialNumber ?? "—"}</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;text-align:center">${l.quantity}</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px">${l.status?.name ?? "—"}</td>
    </tr>`).join("");

  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;margin:0;padding:20px;background:#f8fafc">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:32px">
    <div style="border-bottom:2px solid #1e293b;padding-bottom:16px;margin-bottom:20px">
      <h1 style="margin:0;font-size:20px;color:#1e293b">🛡️ תעודת העברת ציוד</h1>
      <div style="font-size:13px;color:#64748b;margin-top:4px">${TRANSFER_TYPE[t.type]} · ${unitName} · ${docNumber}</div>
    </div>

    <table style="width:100%;font-size:13px;margin-bottom:16px" cellpadding="4">
      <tr><td style="color:#64748b;width:60px">תאריך:</td><td><b>${dateStr} ${timeStr}</b></td></tr>
      <tr><td style="color:#64748b">מאת:</td><td><b>${fromName}</b></td></tr>
      <tr><td style="color:#64748b">אל:</td><td><b>${toName}</b>${t.toSoldier?.personalNumber ? ` (מ.א. ${t.toSoldier.personalNumber})` : ""}</td></tr>
      <tr><td style="color:#64748b">סטטוס:</td><td>${TRANSFER_STATUS[t.status]}</td></tr>
      <tr><td style="color:#64748b">בוצע ע״י:</td><td>${t.createdBy.fullName}</td></tr>
      ${t.approvedBy ? `<tr><td style="color:#64748b">אושר ע״י:</td><td>${t.approvedBy.fullName}</td></tr>` : ""}
      ${t.reason ? `<tr><td style="color:#64748b">הערה:</td><td>${t.reason}</td></tr>` : ""}
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
      <thead>
        <tr style="background:#f1f5f9">
          <th style="border:1px solid #cbd5e1;padding:6px 10px">#</th>
          <th style="border:1px solid #cbd5e1;padding:6px 10px">פריט</th>
          <th style="border:1px solid #cbd5e1;padding:6px 10px">סריאלי</th>
          <th style="border:1px solid #cbd5e1;padding:6px 10px">כמות</th>
          <th style="border:1px solid #cbd5e1;padding:6px 10px">סטטוס</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="background:#f1f5f9;font-weight:bold">
          <td colspan="3" style="border:1px solid #cbd5e1;padding:6px 10px">סה״כ</td>
          <td style="border:1px solid #cbd5e1;padding:6px 10px;text-align:center">${totalQty}</td>
          <td style="border:1px solid #cbd5e1;padding:6px 10px">${t.lines.length} שורות</td>
        </tr>
      </tfoot>
    </table>

    <div style="font-size:11px;color:#94a3b8;text-align:center;margin-top:24px">
      מסמך זה הופק אוטומטית ממערכת PALSAM · ${docNumber}
    </div>
  </div>
</body>
</html>`;
}

async function buildExcelBuffer(t: TransferWithDetails): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PALSAM";
  const ws = wb.addWorksheet("תעודה", { views: [{ rightToLeft: true }] });

  ws.columns = [
    { header: "#", key: "idx", width: 5 },
    { header: "פריט", key: "item", width: 28 },
    { header: "מק״ט", key: "sku", width: 14 },
    { header: "סריאלי", key: "sn", width: 18 },
    { header: "כמות", key: "qty", width: 10 },
    { header: "יחידה", key: "unit", width: 10 },
    { header: "סטטוס", key: "status", width: 12 },
  ];
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  for (let i = 0; i < t.lines.length; i++) {
    const l = t.lines[i];
    ws.addRow({
      idx: i + 1,
      item: l.itemType.name,
      sku: l.itemType.sku ?? "",
      sn: l.serialUnit?.serialNumber ?? "—",
      qty: l.quantity,
      unit: l.itemType.unit,
      status: l.status?.name ?? "",
    });
  }

  const totalQty = t.lines.reduce((s, l) => s + (l.quantity || (l.serialUnit?.lotQuantity ?? 1)), 0);
  const sumRow = ws.addRow({ idx: "", item: "סה״כ", sku: "", sn: "", qty: totalQty, unit: "", status: `${t.lines.length} שורות` });
  sumRow.font = { bold: true };

  const infoWs = wb.addWorksheet("פרטי תעודה", { views: [{ rightToLeft: true }] });
  infoWs.columns = [{ header: "שדה", key: "field", width: 20 }, { header: "ערך", key: "value", width: 40 }];
  infoWs.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  infoWs.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  infoWs.addRow({ field: "מס׳ תעודה", value: t.id.slice(-8).toUpperCase() });
  infoWs.addRow({ field: "סוג", value: TRANSFER_TYPE[t.type] });
  infoWs.addRow({ field: "תאריך", value: t.createdAt.toLocaleDateString("he-IL") + " " + t.createdAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) });
  infoWs.addRow({ field: "מאת", value: t.fromHolder?.name ?? "חטיבה" });
  infoWs.addRow({ field: "אל", value: t.toSoldier?.fullName ?? t.toHolder?.name ?? "—" });
  if (t.toSoldier?.personalNumber) infoWs.addRow({ field: "מ.א.", value: t.toSoldier.personalNumber });
  infoWs.addRow({ field: "סטטוס", value: TRANSFER_STATUS[t.status] });
  infoWs.addRow({ field: "בוצע ע״י", value: t.createdBy.fullName });
  if (t.approvedBy) infoWs.addRow({ field: "אושר ע״י", value: t.approvedBy.fullName });
  if (t.reason) infoWs.addRow({ field: "הערה", value: t.reason });

  const arrayBuf = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuf);
}

export async function buildTransferAttachments(transferId: string): Promise<{
  html: string;
  attachments: { filename: string; content: string }[];
} | null> {
  try {
    const t = await loadTransfer(transferId);
    if (!t) return null;

    const docNumber = t.id.slice(-8).toUpperCase();
    const html = buildHtml(t);
    const excelBuf = await buildExcelBuffer(t);

    return {
      html,
      attachments: [
        { filename: `PALSAM-${docNumber}.xlsx`, content: excelBuf.toString("base64") },
      ],
    };
  } catch {
    return null;
  }
}
