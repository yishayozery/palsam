"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { adjustQuantity } from "@/lib/inventory";

function qtyEntriesFromForm(formData: FormData) {
  const out: { itemTypeId: string; statusId: string; qty: number }[] = [];
  for (const [key, val] of formData.entries()) {
    if (key.startsWith("qty:")) {
      const [, itemTypeId, statusId] = key.split(":");
      const qty = parseInt(String(val), 10);
      if (qty > 0) out.push({ itemTypeId, statusId, qty });
    }
  }
  return out;
}

/** ניפוק (ISSUE): מחסן ◄ פלוגה. הציוד יורד מהמחסן ומוגדר "מלאי במעבר" עד אישור הקבלה. */
export async function createIssue(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "warehouse.operate")) redirect("/");
  const bId = user.battalionId!;
  // מקור: המחסן שנבחר (חייב להיות מבין מחסני המשתמש), אחרת הראשי
  const reqFrom = String(formData.get("fromHolderId") || "");
  const fromHolderId = (reqFrom && user.holderIds.includes(reqFrom) ? reqFrom : null) || user.holderId || user.holderIds[0] || "";
  const toHolderId = String(formData.get("toHolderId") || "");
  const notes = String(formData.get("notes") || "").trim() || null;
  if (!fromHolderId || !toHolderId) return;

  const serialIds = formData.getAll("serial").map(String).filter(Boolean);
  const qtyEntries = qtyEntriesFromForm(formData);
  if (serialIds.length === 0 && qtyEntries.length === 0) return;

  let transferId = "";
  await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: { battalionId: bId, type: "ISSUE", status: "PENDING", fromHolderId, toHolderId, notes, createdById: user.id },
    });
    transferId = transfer.id;
    for (const e of qtyEntries) {
      await adjustQuantity(tx, bId, e.itemTypeId, fromHolderId, e.statusId, -e.qty);
      await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId: e.itemTypeId, quantity: e.qty, statusId: e.statusId } });
    }
    for (const sid of serialIds) {
      const su = await tx.serialUnit.findUnique({ where: { id: sid } });
      if (!su || su.currentHolderId !== fromHolderId) continue;
      await tx.serialUnit.update({ where: { id: sid }, data: { currentHolderId: null } });
      await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId: su.itemTypeId, quantity: su.lotQuantity ?? 1, serialUnitId: sid, statusId: su.statusId } });
    }
  });

  await audit(user.id, "CREATE_ISSUE", "Transfer", transferId, { toHolderId });
  revalidatePath("/transfers");
  redirect(`/transfers/${transferId}/document`);
}

/** החזרה (RETURN): פלוגה ◄ מחסן, עם דיווח סטטוס. PENDING עד אישור מנהל המחסן. */
export async function createReturn(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "company.manage")) redirect("/");
  const bId = user.battalionId!;
  const fromHolderId = user.holderId || String(formData.get("fromHolderId") || "");
  const toHolderId = String(formData.get("toHolderId") || "");
  const returnStatusId = String(formData.get("returnStatusId") || "");
  const notes = String(formData.get("notes") || "").trim() || null;
  if (!fromHolderId || !toHolderId) return;

  const serialIds = formData.getAll("serial").map(String).filter(Boolean);
  const qtyEntries = qtyEntriesFromForm(formData);
  if (serialIds.length === 0 && qtyEntries.length === 0) return;

  let transferId = "";
  await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: { battalionId: bId, type: "RETURN", status: "PENDING", fromHolderId, toHolderId, reason: notes, createdById: user.id },
    });
    transferId = transfer.id;
    for (const e of qtyEntries) {
      await adjustQuantity(tx, bId, e.itemTypeId, fromHolderId, e.statusId, -e.qty);
      await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId: e.itemTypeId, quantity: e.qty, statusId: returnStatusId || e.statusId } });
    }
    for (const sid of serialIds) {
      const su = await tx.serialUnit.findUnique({ where: { id: sid } });
      if (!su || su.currentHolderId !== fromHolderId) continue;
      await tx.serialUnit.update({ where: { id: sid }, data: { currentHolderId: null } });
      await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId: su.itemTypeId, quantity: su.lotQuantity ?? 1, serialUnitId: sid, statusId: returnStatusId || su.statusId } });
    }
  });

  await audit(user.id, "CREATE_RETURN", "Transfer", transferId);
  revalidatePath("/transfers");
  redirect(`/transfers/${transferId}/document`);
}

/** אישור לחיצת יד — קבלת הציוד אצל היעד */
export async function approveTransfer(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "transfer.approve")) redirect("/");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const transfer = await prisma.transfer.findUnique({ where: { id }, include: { lines: true } });
  if (!transfer || transfer.status !== "PENDING") return;

  await prisma.$transaction(async (tx) => {
    const targetHolderId = transfer.toHolderId!;
    for (const line of transfer.lines) {
      if (line.serialUnitId) {
        await tx.serialUnit.update({ where: { id: line.serialUnitId }, data: { currentHolderId: targetHolderId, ...(line.statusId ? { statusId: line.statusId } : {}) } });
      } else if (line.statusId) {
        await adjustQuantity(tx, bId, line.itemTypeId, targetHolderId, line.statusId, line.quantity);
      }
    }
    await tx.transfer.update({ where: { id }, data: { status: "COMPLETED", approvedById: user.id, approvedAt: new Date() } });
  });

  await audit(user.id, "APPROVE", "Transfer", id);
  revalidatePath("/transfers");
}

/** דחיית לחיצת יד — החזרת הציוד למקור */
export async function rejectTransfer(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "transfer.approve")) redirect("/");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const transfer = await prisma.transfer.findUnique({ where: { id }, include: { lines: true } });
  if (!transfer || transfer.status !== "PENDING") return;

  await prisma.$transaction(async (tx) => {
    const sourceHolderId = transfer.fromHolderId!;
    for (const line of transfer.lines) {
      if (line.serialUnitId) {
        await tx.serialUnit.update({ where: { id: line.serialUnitId }, data: { currentHolderId: sourceHolderId } });
      } else if (line.statusId) {
        await adjustQuantity(tx, bId, line.itemTypeId, sourceHolderId, line.statusId, line.quantity);
      }
    }
    await tx.transfer.update({ where: { id }, data: { status: "REJECTED", approvedById: user.id, approvedAt: new Date() } });
  });

  await audit(user.id, "REJECT", "Transfer", id);
  revalidatePath("/transfers");
}
