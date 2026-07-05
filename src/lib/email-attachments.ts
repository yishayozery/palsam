import "server-only";
import ExcelJS from "exceljs";
import { prisma } from "./prisma";
import { TRANSFER_TYPE, TRANSFER_STATUS } from "./labels";
import { buildTransferPdfBuffer } from "./email-pdf";

type TransferWithDetails = NonNullable<Awaited<ReturnType<typeof loadTransfer>>>;

async function loadTransfer(transferId: string) {
  return prisma.transfer.findUnique({
    where: { id: transferId },
    include: {
      battalion: { select: { name: true, code: true, logoData: true, motto: true } },
      fromHolder: { select: { name: true, signatureClause: true } },
      toHolder: { select: { name: true } },
      toSoldier: { select: { fullName: true, personalNumber: true } },
      createdBy: { select: { fullName: true } },
      approvedBy: { select: { fullName: true } },
      signatures: {
        where: { status: "SIGNED" },
        select: {
          signatureData: true,
          signedAt: true,
          soldier: { select: { fullName: true, personalNumber: true } },
          signerUser: { select: { fullName: true, title: true } },
        },
        take: 1,
      },
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

/** זיכוי מחייל: הכיוון הפוך — החייל הוא המקור והמחסן הוא היעד. */
function isSoldierReturn(t: TransferWithDetails): boolean {
  return t.type === "CHECKIN" && !!t.toSoldier;
}

function recipientName(t: TransferWithDetails): string {
  if (isSoldierReturn(t)) return t.toHolder?.name ?? "מחסן";
  return t.toSoldier?.fullName ?? t.toHolder?.name ?? "—";
}

function senderName(t: TransferWithDetails): string {
  if (isSoldierReturn(t)) return t.toSoldier?.fullName ?? "חייל";
  return t.fromHolder?.name ?? "חטיבה (גורם חיצוני)";
}

function buildSubject(t: TransferWithDetails): string {
  const code = t.battalion?.code ?? "";
  const action = TRANSFER_TYPE[t.type] ?? t.type;
  const from = senderName(t);
  const target = recipientName(t);
  const docNumber = t.id.slice(-8).toUpperCase();
  return `[${code}] ${action} · ${from} → ${target} · ${docNumber}`;
}

function sanitizeFilename(s: string): string {
  return s.replace(/[[\]<>:"/\\|?*·]/g, "-").replace(/-{2,}/g, "-").trim();
}

// ============================
// HTML email body (compact for email clients)
// ============================
function buildEmailHtml(t: TransferWithDetails): string {
  const docNumber = t.id.slice(-8).toUpperCase();
  const unitName = t.battalion?.name || "גדוד";
  const dateStr = t.createdAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
  const timeStr = t.createdAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
  const fromName = senderName(t);
  const toName = recipientName(t);
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
      <h1 style="margin:0;font-size:20px;color:#1e293b">תעודת העברת ציוד</h1>
      <div style="font-size:13px;color:#64748b;margin-top:4px">${TRANSFER_TYPE[t.type]} · ${unitName} · ${docNumber}</div>
    </div>

    <table style="width:100%;font-size:13px;margin-bottom:16px" cellpadding="4">
      <tr><td style="color:#64748b;width:80px">מס׳ תנועה:</td><td><b style="font-family:monospace;font-size:14px;letter-spacing:0.05em">${docNumber}</b></td></tr>
      <tr><td style="color:#64748b">תאריך:</td><td><b>${dateStr} ${timeStr}</b></td></tr>
      <tr><td style="color:#64748b">מאת:</td><td><b>${fromName}</b></td></tr>
      <tr><td style="color:#64748b">אל:</td><td><b>${toName}</b>${!isSoldierReturn(t) && t.toSoldier?.personalNumber ? ` (מ.א. ${t.toSoldier.personalNumber})` : ""}</td></tr>
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
      מסמך זה הופק אוטומטית ממערכת PALMY · ${docNumber}
    </div>
  </div>
</body>
</html>`;
}

// ============================
// Printable HTML document (mirrors /transfers/[id]/document exactly)
// ============================
function buildPrintableHtml(t: TransferWithDetails): string {
  const docNumber = t.id.slice(-8).toUpperCase();
  const unitName = t.battalion?.name || "גדוד";
  const dateStr = t.createdAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
  const timeStr = t.createdAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });

  const logoHtml = t.battalion?.logoData
    ? `<img src="${t.battalion.logoData}" alt="סמל הגדוד" style="width:56px;height:56px;object-fit:contain" />`
    : "";

  const mottoHtml = t.battalion?.motto
    ? `<div style="font-size:11px;color:#64748b;font-style:italic">״${t.battalion.motto}״</div>`
    : "";

  const sig = t.signatures?.[0];
  const sigHtml = sig?.signatureData
    ? `<div style="margin-top:12px;border:1px solid #e2e8f0;border-radius:8px;padding:8px;background:#f8fafc">
        <div style="font-size:10px;color:#64748b;margin-bottom:4px">חתימה דיגיטלית:</div>
        <img src="${sig.signatureData}" alt="חתימה" style="max-height:96px;object-fit:contain" />
        ${sig.signedAt ? `<div style="font-size:10px;color:#94a3b8;margin-top:4px">נחתם: ${sig.signedAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}${sig.soldier?.personalNumber ? ` · מ.א. ${sig.soldier.personalNumber}` : ""}</div>` : ""}
      </div>`
    : "";

  const clauseHtml = t.fromHolder?.signatureClause
    ? `<div style="margin-top:32px;border:2px solid #1e293b;border-radius:8px;padding:16px;background:#f8fafc">
        <div style="font-size:11px;font-weight:bold;color:#1e293b;margin-bottom:8px;letter-spacing:0.05em">📝 הצהרת חייל / תניית חתימה</div>
        <pre style="font-size:13px;color:#1e293b;white-space:pre-wrap;font-family:Arial,sans-serif;line-height:1.6;margin:0">${t.fromHolder.signatureClause}</pre>
      </div>`
    : "";

  const rows = t.lines.map((l, i) => `
    <tr>
      <td style="border:1px solid #cbd5e1;padding:8px 12px;text-align:center">${i + 1}</td>
      <td style="border:1px solid #cbd5e1;padding:8px 12px">${l.itemType.name}</td>
      <td style="border:1px solid #cbd5e1;padding:8px 12px;font-family:monospace;font-size:11px">${l.serialUnit?.serialNumber ?? "—"}</td>
      <td style="border:1px solid #cbd5e1;padding:8px 12px;text-align:center">${l.quantity}</td>
      <td style="border:1px solid #cbd5e1;padding:8px 12px">${l.status?.name ?? "—"}</td>
    </tr>`).join("");

  const approverName = t.approvedBy?.fullName
    ?? sig?.soldier?.fullName
    ?? sig?.signerUser?.fullName
    ?? "________________";
  const approvedDateHtml = t.approvedAt
    ? `<span style="color:#94a3b8"> · ${t.approvedAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}</span>`
    : "";

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <title>תעודת העברת ציוד — ${docNumber}</title>
  <style>
    @media print { body { background: #fff !important; } .no-print { display: none !important; } }
    body { font-family: Arial, "Helvetica Neue", sans-serif; margin: 0; padding: 20px; background: #f8fafc; }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center;margin-bottom:16px">
    <button onclick="window.print()" style="padding:8px 24px;font-size:14px;background:#1e293b;color:#fff;border:none;border-radius:8px;cursor:pointer">🖨️ הדפסה</button>
  </div>

  <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:32px">
    <!-- כותרת -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1e293b;padding-bottom:16px;margin-bottom:24px">
      <div style="display:flex;align-items:center;gap:12px">
        ${logoHtml}
        <div>
          <h1 style="margin:0;font-size:22px;font-weight:bold;color:#1e293b">תעודת העברת ציוד</h1>
          <div style="font-size:13px;color:#64748b;margin-top:4px">${TRANSFER_TYPE[t.type]}</div>
        </div>
      </div>
      <div style="text-align:left;font-size:13px;display:flex;align-items:center;gap:12px">
        <div>
          <div style="font-weight:bold">${unitName}</div>
          ${mottoHtml}
          <div style="color:#64748b">מס׳ תעודה: ${docNumber}</div>
          <div style="color:#64748b">${dateStr} ${timeStr}</div>
        </div>
        <div style="font-size:28px">🛡️</div>
      </div>
    </div>

    <!-- פרטי העברה -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;font-size:13px">
      <div><span style="color:#64748b">מאת:</span> <span style="font-weight:500">${senderName(t)}</span></div>
      <div><span style="color:#64748b">אל:</span> <span style="font-weight:500">${recipientName(t)}</span></div>
      <div><span style="color:#64748b">סטטוס:</span> <span style="font-weight:500">${TRANSFER_STATUS[t.status]}</span></div>
      ${t.reason ? `<div><span style="color:#64748b">הערה:</span> ${t.reason}</div>` : ""}
    </div>

    <!-- טבלת פריטים -->
    <table style="width:100%;font-size:13px;text-align:right;border:1px solid #cbd5e1;border-collapse:collapse;margin-bottom:24px">
      <thead>
        <tr style="background:#f1f5f9">
          <th style="border:1px solid #cbd5e1;padding:8px 12px">#</th>
          <th style="border:1px solid #cbd5e1;padding:8px 12px">פריט</th>
          <th style="border:1px solid #cbd5e1;padding:8px 12px">מספר סריאלי</th>
          <th style="border:1px solid #cbd5e1;padding:8px 12px">כמות</th>
          <th style="border:1px solid #cbd5e1;padding:8px 12px">סטטוס</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <!-- תניית חתימה -->
    ${clauseHtml}

    <!-- חתימות -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:40px;font-size:13px">
      <div style="border-top:1px solid #94a3b8;padding-top:8px">
        <div style="color:#64748b">מוסר / יוצר התעודה</div>
        <div style="font-weight:500;margin-top:4px">${t.createdBy.fullName}</div>
      </div>
      <div style="border-top:1px solid #94a3b8;padding-top:8px">
        <div style="color:#64748b">מקבל / מאשר</div>
        <div style="font-weight:500;margin-top:4px">${approverName}${approvedDateHtml}</div>
        ${sigHtml}
      </div>
    </div>

    <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:32px">
      מסמך זה הופק אוטומטית ממערכת ניהול המלאי הגדודי · ${docNumber}
    </p>
  </div>
</body>
</html>`;
}

// ============================
// Excel
// ============================
async function buildExcelBuffer(t: TransferWithDetails): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PALMY";
  const docNumber = t.id.slice(-8).toUpperCase();
  const dateStr = t.createdAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" }) + " " + t.createdAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
  const fromName = senderName(t);
  const toName = recipientName(t);
  const typeName = TRANSFER_TYPE[t.type] ?? t.type;

  const ws = wb.addWorksheet("תעודה", { views: [{ rightToLeft: true }] });

  ws.columns = [
    { header: "#", key: "idx", width: 5 },
    { header: "מס׳ תנועה", key: "docNum", width: 14 },
    { header: "פריט", key: "item", width: 28 },
    { header: "מק״ט", key: "sku", width: 14 },
    { header: "סריאלי", key: "sn", width: 18 },
    { header: "כמות", key: "qty", width: 10 },
    { header: "יחידה", key: "unit", width: 10 },
    { header: "סטטוס פריט", key: "status", width: 12 },
    { header: "סוג תנועה", key: "type", width: 14 },
    { header: "תאריך", key: "date", width: 18 },
    { header: "מאת", key: "from", width: 18 },
    { header: "אל", key: "to", width: 18 },
    { header: "מבצע", key: "createdBy", width: 16 },
  ];
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  for (let i = 0; i < t.lines.length; i++) {
    const l = t.lines[i];
    ws.addRow({
      idx: i + 1,
      docNum: docNumber,
      item: l.itemType.name,
      sku: l.itemType.sku ?? "",
      sn: l.serialUnit?.serialNumber ?? "—",
      qty: l.quantity,
      unit: l.itemType.unit,
      status: l.status?.name ?? "",
      type: typeName,
      date: dateStr,
      from: fromName,
      to: toName,
      createdBy: t.createdBy.fullName,
    });
  }

  const totalQty = t.lines.reduce((s, l) => s + (l.quantity || (l.serialUnit?.lotQuantity ?? 1)), 0);
  const sumRow = ws.addRow({ idx: "", docNum: "", item: "סה״כ", sku: "", sn: "", qty: totalQty, unit: "", status: `${t.lines.length} שורות`, type: "", date: "", from: "", to: "", createdBy: "" });
  sumRow.font = { bold: true };

  const infoWs = wb.addWorksheet("פרטי תעודה", { views: [{ rightToLeft: true }] });
  infoWs.columns = [{ header: "שדה", key: "field", width: 20 }, { header: "ערך", key: "value", width: 40 }];
  infoWs.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  infoWs.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  infoWs.addRow({ field: "מס׳ תנועה", value: docNumber });
  infoWs.addRow({ field: "מזהה מלא (ID)", value: t.id });
  infoWs.addRow({ field: "סוג", value: typeName });
  infoWs.addRow({ field: "תאריך", value: dateStr });
  infoWs.addRow({ field: "מאת", value: t.fromHolder?.name ?? "חטיבה" });
  infoWs.addRow({ field: "אל", value: toName });
  if (t.toSoldier?.personalNumber) infoWs.addRow({ field: "מ.א.", value: t.toSoldier.personalNumber });
  infoWs.addRow({ field: "סטטוס תעודה", value: TRANSFER_STATUS[t.status] });
  infoWs.addRow({ field: "בוצע ע״י", value: t.createdBy.fullName });
  if (t.approvedBy) infoWs.addRow({ field: "אושר ע״י", value: t.approvedBy.fullName });
  if (t.reason) infoWs.addRow({ field: "הערה", value: t.reason });

  const arrayBuf = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuf);
}

// ============================
// Public API
// ============================
export async function buildTransferAttachments(transferId: string): Promise<{
  subject: string;
  html: string;
  attachments: { filename: string; content: string }[];
} | null> {
  try {
    const t = await loadTransfer(transferId);
    if (!t) return null;

    const subject = buildSubject(t);
    const baseName = sanitizeFilename(subject);
    const html = buildEmailHtml(t);
    const [excelBuf, pdfBuf] = await Promise.all([
      buildExcelBuffer(t),
      buildTransferPdfBuffer(t).catch(() => null),
    ]);

    const attachments: { filename: string; content: string }[] = [];
    if (pdfBuf) {
      attachments.push({ filename: `${baseName}.pdf`, content: pdfBuf.toString("base64") });
    }
    attachments.push({ filename: `${baseName}.xlsx`, content: excelBuf.toString("base64") });

    return { subject, html, attachments };
  } catch {
    return null;
  }
}
