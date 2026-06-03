"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, requireCapability } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { adjustQuantity } from "@/lib/inventory";

/**
 * יצירת הקצאה (ISSUE): מחסן גדודי ◄ פלוגה/נשקייה.
 * הציוד יורד ממלאי המחסן ומוגדר "מלאי במעבר" (PENDING) עד אישור הקבלה (handshake).
 */
export async function createIssue(formData: FormData) {
  const user = await requireCapability("warehouse.manage");
  const toHolderId = String(formData.get("toHolderId") || "");
  const notes = String(formData.get("notes") || "").trim() || null;
  const warehouse = await prisma.holder.findFirst({ where: { type: "WAREHOUSE" } });
  if (!warehouse || !toHolderId) return;

  // קווי מלאי כמותי: quantity[<itemTypeId>:<statusId>] = qty
  // יחידות סריאליות: serial[] = serialUnitId
  const serialIds = formData.getAll("serial").map(String).filter(Boolean);
  const qtyEntries: { itemTypeId: string; statusId: string; qty: number }[] = [];
  for (const [key, val] of formData.entries()) {
    if (key.startsWith("qty:")) {
      const [, itemTypeId, statusId] = key.split(":");
      const qty = parseInt(String(val), 10);
      if (qty > 0) qtyEntries.push({ itemTypeId, statusId, qty });
    }
  }
  if (serialIds.length === 0 && qtyEntries.length === 0) return;

  let transferId = "";
  await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: {
        type: "ISSUE",
        status: "PENDING",
        fromHolderId: warehouse.id,
        toHolderId,
        notes,
        createdById: user.id,
      },
    });
    transferId = transfer.id;

    for (const e of qtyEntries) {
      await adjustQuantity(tx, e.itemTypeId, warehouse.id, e.statusId, -e.qty);
      await tx.transferLine.create({
        data: { transferId: transfer.id, itemTypeId: e.itemTypeId, quantity: e.qty, statusId: e.statusId },
      });
    }
    for (const sid of serialIds) {
      const su = await tx.serialUnit.findUnique({ where: { id: sid } });
      if (!su || su.currentHolderId !== warehouse.id) continue;
      // במעבר: מנותק ממיקום עד אישור
      await tx.serialUnit.update({ where: { id: sid }, data: { currentHolderId: null } });
      await tx.transferLine.create({
        data: { transferId: transfer.id, itemTypeId: su.itemTypeId, quantity: su.lotQuantity ?? 1, serialUnitId: sid, statusId: su.statusId },
      });
    }
  });

  await audit(user.id, "CREATE_ISSUE", "Transfer", transferId, { toHolderId });
  revalidatePath("/transfers");
  redirect(`/transfers/${transferId}/document`);
}

/**
 * יצירת החזרה (RETURN): פלוגה ◄ מחסן גדודי, עם דיווח סטטוס (תקין/בלאי/פגום).
 * נכנס כ-PENDING עד אישור קצין הלוגיסטיקה.
 */
export async function createReturn(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "company.manage") && !can(user.role, "armory.manage")) {
    redirect("/transfers");
  }
  const fromHolderId = user.holderId || String(formData.get("fromHolderId") || "");
  const warehouse = await prisma.holder.findFirst({ where: { type: "WAREHOUSE" } });
  const returnStatusId = String(formData.get("returnStatusId") || "");
  const notes = String(formData.get("notes") || "").trim() || null;
  if (!warehouse || !fromHolderId) return;

  const serialIds = formData.getAll("serial").map(String).filter(Boolean);
  const qtyEntries: { itemTypeId: string; statusId: string; qty: number }[] = [];
  for (const [key, val] of formData.entries()) {
    if (key.startsWith("qty:")) {
      const [, itemTypeId, statusId] = key.split(":");
      const qty = parseInt(String(val), 10);
      if (qty > 0) qtyEntries.push({ itemTypeId, statusId, qty });
    }
  }
  if (serialIds.length === 0 && qtyEntries.length === 0) return;

  let transferId = "";
  await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: {
        type: "RETURN",
        status: "PENDING",
        fromHolderId,
        toHolderId: warehouse.id,
        reason: notes,
        createdById: user.id,
      },
    });
    transferId = transfer.id;

    for (const e of qtyEntries) {
      await adjustQuantity(tx, e.itemTypeId, fromHolderId, e.statusId, -e.qty);
      await tx.transferLine.create({
        data: { transferId: transfer.id, itemTypeId: e.itemTypeId, quantity: e.qty, statusId: returnStatusId || e.statusId },
      });
    }
    for (const sid of serialIds) {
      const su = await tx.serialUnit.findUnique({ where: { id: sid } });
      if (!su || su.currentHolderId !== fromHolderId) continue;
      await tx.serialUnit.update({ where: { id: sid }, data: { currentHolderId: null } });
      await tx.transferLine.create({
        data: { transferId: transfer.id, itemTypeId: su.itemTypeId, quantity: su.lotQuantity ?? 1, serialUnitId: sid, statusId: returnStatusId || su.statusId },
      });
    }
  });

  await audit(user.id, "CREATE_RETURN", "Transfer", transferId);
  revalidatePath("/transfers");
  redirect(`/transfers/${transferId}/document`);
}

/** אישור לחיצת יד — קבלת הציוד אצל היעד */
export async function approveTransfer(formData: FormData) {
  const user = await requireCapability("transfer.approve");
  const id = String(formData.get("id") || "");
  const transfer = await prisma.transfer.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!transfer || transfer.status !== "PENDING") return;

  await prisma.$transaction(async (tx) => {
    const targetHolderId = transfer.toHolderId!;
    for (const line of transfer.lines) {
      if (line.serialUnitId) {
        await tx.serialUnit.update({
          where: { id: line.serialUnitId },
          data: {
            currentHolderId: targetHolderId,
            ...(line.statusId ? { statusId: line.statusId } : {}),
          },
        });
      } else if (line.statusId) {
        await adjustQuantity(tx, line.itemTypeId, targetHolderId, line.statusId, line.quantity);
      }
    }
    await tx.transfer.update({
      where: { id },
      data: { status: "COMPLETED", approvedById: user.id, approvedAt: new Date() },
    });
  });

  await audit(user.id, "APPROVE", "Transfer", id);
  revalidatePath("/transfers");
}

/** דחיית לחיצת יד — החזרת הציוד למקור */
export async function rejectTransfer(formData: FormData) {
  const user = await requireCapability("transfer.approve");
  const id = String(formData.get("id") || "");
  const transfer = await prisma.transfer.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!transfer || transfer.status !== "PENDING") return;

  await prisma.$transaction(async (tx) => {
    const sourceHolderId = transfer.fromHolderId!;
    for (const line of transfer.lines) {
      if (line.serialUnitId) {
        await tx.serialUnit.update({
          where: { id: line.serialUnitId },
          data: { currentHolderId: sourceHolderId },
        });
      } else if (line.statusId) {
        await adjustQuantity(tx, line.itemTypeId, sourceHolderId, line.statusId, line.quantity);
      }
    }
    await tx.transfer.update({
      where: { id },
      data: { status: "REJECTED", approvedById: user.id, approvedAt: new Date() },
    });
  });

  await audit(user.id, "REJECT", "Transfer", id);
  revalidatePath("/transfers");
}
