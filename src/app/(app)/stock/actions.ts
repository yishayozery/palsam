"use server";

import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { adjustQuantity, defaultStatusId } from "@/lib/inventory";

function cell(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "text" in v) return String((v as { text: string }).text);
  return String(v).trim();
}

async function pickWarehouse(bId: string, itemTypeId: string) {
  const item = await prisma.itemType.findUnique({ where: { id: itemTypeId }, include: { category: true } });
  if (!item) return null;
  const wtype = item.category?.warehouseType;
  const wh = wtype
    ? await prisma.holder.findFirst({ where: { battalionId: bId, kind: "WAREHOUSE", warehouseType: wtype } })
    : await prisma.holder.findFirst({ where: { battalionId: bId, kind: "WAREHOUSE" } });
  return wh;
}

/** הצהרת מלאי כמותי — מעדכן את היתרה לכמות החדשה */
export async function declareQty(formData: FormData) {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const itemTypeId = String(formData.get("itemTypeId") || "");
  const quantity = Math.max(0, parseInt(String(formData.get("quantity") || "0"), 10) || 0);
  const statusId = String(formData.get("statusId") || "") || (await defaultStatusId(prisma, bId));

  const wh = await pickWarehouse(bId, itemTypeId);
  if (!wh) return;

  await prisma.$transaction(async (tx) => {
    const current = await tx.stockBalance.findFirst({ where: { itemTypeId, holderId: wh.id, statusId } });
    const delta = quantity - (current?.quantity ?? 0);
    if (delta !== 0) {
      await adjustQuantity(tx, bId, itemTypeId, wh.id, statusId, delta);
      await tx.transfer.create({
        data: {
          battalionId: bId, type: delta > 0 ? "INTAKE" : "WRITE_OFF", status: "COMPLETED",
          toHolderId: delta > 0 ? wh.id : null, fromHolderId: delta < 0 ? wh.id : null,
          reason: "עדכון מלאי גדודי", createdById: user.id, approvedById: user.id, approvedAt: new Date(),
          lines: { create: { itemTypeId, quantity: Math.abs(delta), statusId } },
        },
      });
    }
  });

  await audit(user.id, "DECLARE_QTY", "ItemType", itemTypeId, { quantity, statusId });
  revalidatePath("/stock");
}

/** הוספת יחידות סריאליות לפי מספרים שהוקלדו (אחת בשורה / בפסיק) */
export async function declareSerials(formData: FormData) {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const itemTypeId = String(formData.get("itemTypeId") || "");
  const serialsRaw = String(formData.get("serials") || "");
  const statusId = String(formData.get("statusId") || "") || (await defaultStatusId(prisma, bId));

  const serials = serialsRaw.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  if (serials.length === 0) return;

  const wh = await pickWarehouse(bId, itemTypeId);
  if (!wh) return;

  let created = 0;
  await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: { battalionId: bId, type: "INTAKE", status: "COMPLETED", toHolderId: wh.id, reason: "הזנת סריאליים ידני", createdById: user.id, approvedById: user.id, approvedAt: new Date() },
    });
    for (const sn of serials) {
      try {
        await tx.serialUnit.create({ data: { battalionId: bId, itemTypeId, serialNumber: sn, statusId, currentHolderId: wh.id } });
        await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId, quantity: 1, statusId } });
        created++;
      } catch { /* כפילות */ }
    }
  });
  await audit(user.id, "DECLARE_SERIALS", "ItemType", itemTypeId, { count: created });
  revalidatePath("/stock");
}

/** טעינת סריאליים מקובץ אקסל */
export async function importSerials(formData: FormData) {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const itemTypeId = String(formData.get("itemTypeId") || "");
  const statusId = String(formData.get("statusId") || "") || (await defaultStatusId(prisma, bId));
  const file = formData.get("file") as File | null;
  if (!itemTypeId || !file || file.size === 0) return;

  const wh = await pickWarehouse(bId, itemTypeId);
  if (!wh) return;

  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as any);
  const ws = wb.worksheets[0];
  if (!ws) return;

  const serials: string[] = [];
  ws.eachRow((row, idx) => { if (idx === 1) return; const sn = cell(row.getCell(1).value); if (sn) serials.push(sn); });
  if (serials.length === 0) return;

  let created = 0;
  await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: { battalionId: bId, type: "INTAKE", status: "COMPLETED", toHolderId: wh.id, reason: "טעינת סריאליים מקובץ", createdById: user.id, approvedById: user.id, approvedAt: new Date() },
    });
    for (const sn of serials) {
      try {
        await tx.serialUnit.create({ data: { battalionId: bId, itemTypeId, serialNumber: sn, statusId, currentHolderId: wh.id } });
        await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId, quantity: 1, statusId } });
        created++;
      } catch { /* כפילות */ }
    }
  });
  await audit(user.id, "IMPORT_SERIALS", "ItemType", itemTypeId, { count: created });
  revalidatePath("/stock");
}

/** הוספת אצווה (מספר אצווה + כמות). אפשר כמה אצוות לאותו פריט. */
export async function declareLot(formData: FormData) {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const itemTypeId = String(formData.get("itemTypeId") || "");
  const lotNumber = String(formData.get("lotNumber") || "").trim();
  const quantity = Math.max(1, parseInt(String(formData.get("quantity") || "0"), 10) || 0);
  const statusId = String(formData.get("statusId") || "") || (await defaultStatusId(prisma, bId));
  if (!lotNumber || quantity < 1) return;

  const wh = await pickWarehouse(bId, itemTypeId);
  if (!wh) return;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.serialUnit.create({ data: { battalionId: bId, itemTypeId, serialNumber: lotNumber, lotQuantity: quantity, statusId, currentHolderId: wh.id } });
      await tx.transfer.create({
        data: { battalionId: bId, type: "INTAKE", status: "COMPLETED", toHolderId: wh.id, reason: "הוספת אצווה", createdById: user.id, approvedById: user.id, approvedAt: new Date(),
          lines: { create: { itemTypeId, quantity, statusId } } },
      });
    });
  } catch { /* כפילות מספר אצווה */ }
  await audit(user.id, "DECLARE_LOT", "ItemType", itemTypeId, { lot: lotNumber, quantity });
  revalidatePath("/stock");
}

/** טעינת אצוות מקובץ אקסל (עמודה 1: מספר אצווה, עמודה 2: כמות) */
export async function importLots(formData: FormData) {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const itemTypeId = String(formData.get("itemTypeId") || "");
  const statusId = String(formData.get("statusId") || "") || (await defaultStatusId(prisma, bId));
  const file = formData.get("file") as File | null;
  if (!itemTypeId || !file || file.size === 0) return;

  const wh = await pickWarehouse(bId, itemTypeId);
  if (!wh) return;

  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as any);
  const ws = wb.worksheets[0];
  if (!ws) return;

  const lots: { sn: string; qty: number }[] = [];
  ws.eachRow((row, idx) => {
    if (idx === 1) return;
    const sn = cell(row.getCell(1).value);
    const qty = parseInt(cell(row.getCell(2).value), 10);
    if (sn && qty > 0) lots.push({ sn, qty });
  });
  if (lots.length === 0) return;

  let created = 0;
  await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: { battalionId: bId, type: "INTAKE", status: "COMPLETED", toHolderId: wh.id, reason: "טעינת אצוות מקובץ", createdById: user.id, approvedById: user.id, approvedAt: new Date() },
    });
    for (const l of lots) {
      try {
        await tx.serialUnit.create({ data: { battalionId: bId, itemTypeId, serialNumber: l.sn, lotQuantity: l.qty, statusId, currentHolderId: wh.id } });
        await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId, quantity: l.qty, statusId } });
        created++;
      } catch { /* כפילות */ }
    }
  });
  await audit(user.id, "IMPORT_LOTS", "ItemType", itemTypeId, { count: created });
  revalidatePath("/stock");
}
