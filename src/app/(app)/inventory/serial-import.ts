"use server";

import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

function cell(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "text" in v) return String((v as { text: string }).text);
  return String(v).trim();
}

/** ייבוא יחידות סריאליות מקובץ אקסל (עמודה 1 = מספר סריאלי) */
export async function importSerials(formData: FormData): Promise<void> {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const itemTypeId = String(formData.get("itemTypeId") || "");
  const statusId = String(formData.get("statusId") || "");
  const file = formData.get("file") as File | null;
  if (!itemTypeId || !file || file.size === 0) return;

  const item = await prisma.itemType.findUnique({ where: { id: itemTypeId } });
  if (!item || item.trackingMethod !== "SERIAL") return;
  const warehouseId = user.holderId;
  if (!warehouseId) return;

  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as any);
  const ws = wb.worksheets[0];
  if (!ws) return;

  const serials: string[] = [];
  ws.eachRow((row, idx) => {
    if (idx === 1) return; // כותרת
    const sn = cell(row.getCell(1).value);
    if (sn) serials.push(sn);
  });
  if (serials.length === 0) return;

  let created = 0;
  await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: { battalionId: bId, type: "INTAKE", status: "COMPLETED", toHolderId: warehouseId, reason: "קליטת סריאליים מקובץ", createdById: user.id, approvedById: user.id, approvedAt: new Date() },
    });
    for (const sn of serials) {
      try {
        await tx.serialUnit.create({
          data: { battalionId: bId, itemTypeId, serialNumber: sn, statusId, currentHolderId: warehouseId },
        });
        await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId, quantity: 1, statusId } });
        created++;
      } catch {
        // דלג על סריאלי כפול
      }
    }
  });

  await audit(user.id, "IMPORT_SERIALS", "ItemType", itemTypeId, { count: created });
  revalidatePath("/inventory");
}
