"use server";

import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { TRANSFER_TYPE, TRANSFER_STATUS } from "@/lib/labels";

export type BackupLine = {
  row: number;
  docNum: string;
  item: string;
  sku: string;
  serial: string;
  qty: number;
  type: string;
  date: string;
  from: string;
  to: string;
  createdBy: string;
};

export type VerifyResult = {
  docNum: string;
  status: "found" | "not_found" | "mismatch";
  lines: BackupLine[];
  dbInfo?: {
    type: string;
    status: string;
    date: string;
    from: string;
    to: string;
    lineCount: number;
    totalQty: number;
  };
  mismatches?: string[];
};

export async function verifyBackupExcel(
  formData: FormData,
): Promise<{ results: VerifyResult[]; error?: string }> {
  const user = await requireUser();
  if (!can(user, "battalion.profile")) return { results: [], error: "אין הרשאה" };
  const bId = user.battalionId!;

  const file = formData.get("file") as File | null;
  if (!file) return { results: [], error: "לא נבחר קובץ" };

  const arrayBuf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(arrayBuf as ArrayBuffer);
  } catch {
    return { results: [], error: "לא ניתן לקרוא את קובץ האקסל" };
  }

  const ws = wb.getWorksheet("תעודה") ?? wb.getWorksheet(1);
  if (!ws) return { results: [], error: "גיליון 'תעודה' לא נמצא" };

  // Parse header row to find column indices
  const headerRow = ws.getRow(1);
  const colMap: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    const val = String(cell.value ?? "").trim();
    colMap[val] = colNumber;
  });

  const docNumCol = colMap["מס׳ תנועה"] ?? colMap["מס' תנועה"];
  const itemCol = colMap["פריט"];
  const skuCol = colMap["מק״ט"] ?? colMap["מק'ט"];
  const snCol = colMap["סריאלי"];
  const qtyCol = colMap["כמות"];
  const typeCol = colMap["סוג תנועה"];
  const dateCol = colMap["תאריך"];
  const fromCol = colMap["מאת"];
  const toCol = colMap["אל"];
  const createdByCol = colMap["מבצע"];

  if (!docNumCol || !itemCol) {
    return { results: [], error: "מבנה הקובץ לא תואם — חסרות עמודות 'מס׳ תנועה' ו/או 'פריט'" };
  }

  // Group rows by docNum
  const linesByDoc = new Map<string, BackupLine[]>();
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const docNum = String(row.getCell(docNumCol).value ?? "").trim();
    if (!docNum || docNum === "סה״כ") continue;

    const line: BackupLine = {
      row: r,
      docNum,
      item: String(row.getCell(itemCol).value ?? "").trim(),
      sku: skuCol ? String(row.getCell(skuCol).value ?? "").trim() : "",
      serial: snCol ? String(row.getCell(snCol).value ?? "").trim() : "",
      qty: qtyCol ? Number(row.getCell(qtyCol).value) || 0 : 0,
      type: typeCol ? String(row.getCell(typeCol).value ?? "").trim() : "",
      date: dateCol ? String(row.getCell(dateCol).value ?? "").trim() : "",
      from: fromCol ? String(row.getCell(fromCol).value ?? "").trim() : "",
      to: toCol ? String(row.getCell(toCol).value ?? "").trim() : "",
      createdBy: createdByCol ? String(row.getCell(createdByCol).value ?? "").trim() : "",
    };
    if (!linesByDoc.has(docNum)) linesByDoc.set(docNum, []);
    linesByDoc.get(docNum)!.push(line);
  }

  if (linesByDoc.size === 0) {
    return { results: [], error: "לא נמצאו שורות בקובץ" };
  }

  // For each docNum, try to find the transfer in DB
  // docNum is last 8 chars of transfer ID (uppercase)
  const results: VerifyResult[] = [];

  for (const [docNum, lines] of linesByDoc) {
    const suffix = docNum.toLowerCase();
    const matches = await prisma.transfer.findMany({
      where: { battalionId: bId, id: { endsWith: suffix } },
      select: {
        id: true, type: true, status: true, createdAt: true,
        fromHolder: { select: { name: true } },
        toHolder: { select: { name: true } },
        toSoldier: { select: { fullName: true } },
        lines: {
          select: { quantity: true, itemType: { select: { name: true } } },
        },
      },
      take: 1,
    });
    const match = matches[0] ?? null;

    if (!match) {
      results.push({ docNum, status: "not_found", lines });
      continue;
    }

    const dbFrom = match.fromHolder?.name ?? "חטיבה";
    const dbTo = match.toSoldier?.fullName ?? match.toHolder?.name ?? "—";
    const dbLineCount = match.lines.length;
    const dbTotalQty = match.lines.reduce((s, l) => s + l.quantity, 0);
    const dbDate = match.createdAt.toLocaleDateString("he-IL") + " " + match.createdAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

    const dbInfo = {
      type: TRANSFER_TYPE[match.type] ?? match.type,
      status: TRANSFER_STATUS[match.status] ?? match.status,
      date: dbDate,
      from: dbFrom,
      to: dbTo,
      lineCount: dbLineCount,
      totalQty: dbTotalQty,
    };

    // Check for mismatches
    const mismatches: string[] = [];
    const excelTotalQty = lines.reduce((s, l) => s + l.qty, 0);

    if (lines.length !== dbLineCount) {
      mismatches.push(`מספר שורות: אקסל ${lines.length}, מערכת ${dbLineCount}`);
    }
    if (excelTotalQty !== dbTotalQty) {
      mismatches.push(`סה״כ כמות: אקסל ${excelTotalQty}, מערכת ${dbTotalQty}`);
    }

    results.push({
      docNum,
      status: mismatches.length > 0 ? "mismatch" : "found",
      lines,
      dbInfo,
      mismatches,
    });
  }

  return { results };
}
