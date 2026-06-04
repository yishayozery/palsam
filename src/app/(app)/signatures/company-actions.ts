"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { adjustQuantity, defaultStatusId } from "@/lib/inventory";
import type { SignatureMethod } from "@/generated/prisma";

/**
 * החתמת פלוגה: ניפוק לפלוגה כשהנמען הוא משתמש בפלוגה (מפ/רס"פ),
 * הוא חותם דיגיטלית, והפריטים עוברים לפלוגה אוטומטית עם החתימה.
 */
export async function createCompanySign(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "signatures.manage")) redirect("/signatures");
  const bId = user.battalionId!;

  const companyId = String(formData.get("companyId") || "");
  const recipientUserId = String(formData.get("recipientUserId") || "");
  const method = String(formData.get("method") || "QR") as SignatureMethod;
  const serialIds = formData.getAll("serial").map(String).filter(Boolean);
  const qtyEntries: { itemTypeId: string; statusId: string; qty: number }[] = [];
  for (const [key, val] of formData.entries()) {
    if (key.startsWith("qty:")) {
      const [, itemTypeId, statusId] = key.split(":");
      const qty = parseInt(String(val), 10);
      if (qty > 0) qtyEntries.push({ itemTypeId, statusId, qty });
    }
  }

  if (!companyId || !recipientUserId || (serialIds.length === 0 && qtyEntries.length === 0)) return;

  const token = nanoid(24);
  let transferId = "";
  await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: {
        battalionId: bId, type: "ISSUE", status: "PENDING",
        fromHolderId: user.holderId, toHolderId: companyId, toUserId: recipientUserId,
        notes: "החתמת פלוגה דרך נמען", createdById: user.id,
      },
    });
    transferId = transfer.id;
    // מורידים מהמקור (במעבר עד החתימה)
    for (const e of qtyEntries) {
      await adjustQuantity(tx, bId, e.itemTypeId, user.holderId!, e.statusId, -e.qty);
      await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId: e.itemTypeId, quantity: e.qty, statusId: e.statusId } });
    }
    for (const sid of serialIds) {
      const su = await tx.serialUnit.findUnique({ where: { id: sid } });
      if (!su || su.currentHolderId !== user.holderId) continue;
      await tx.serialUnit.update({ where: { id: sid }, data: { currentHolderId: null } });
      await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId: su.itemTypeId, quantity: su.lotQuantity ?? 1, serialUnitId: sid, statusId: su.statusId } });
    }
    await tx.signature.create({
      data: {
        battalionId: bId, signerUserId: recipientUserId, transferId: transfer.id,
        method, status: "PENDING", token,
        tokenExpires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      },
    });
  });

  await audit(user.id, "COMPANY_SIGN_OUT", "Transfer", transferId, { companyId, recipientUserId });
  revalidatePath("/signatures");
  redirect(`/signatures/${token}`);
}

/** השלמת חתימה של נמען (מפ/רס"פ) → הפריטים עוברים לפלוגה */
export async function completeCompanySignature(token: string, signatureData: string) {
  const sig = await prisma.signature.findUnique({
    where: { token },
    include: { transfer: { include: { lines: true } } },
  });
  if (!sig || sig.status !== "PENDING" || !sig.transfer) return { ok: false, error: "החתימה אינה זמינה או כבר בוצעה" };
  if (sig.tokenExpires && sig.tokenExpires < new Date()) {
    await prisma.signature.update({ where: { token }, data: { status: "EXPIRED" } });
    return { ok: false, error: "פג תוקף הקישור" };
  }

  await prisma.$transaction(async (tx) => {
    const t = sig.transfer!;
    const targetHolderId = t.toHolderId!;
    for (const line of t.lines) {
      if (line.serialUnitId) {
        await tx.serialUnit.update({ where: { id: line.serialUnitId }, data: { currentHolderId: targetHolderId } });
      } else if (line.statusId) {
        const bId = t.battalionId!;
        const sId = line.statusId ?? await defaultStatusId(tx, bId);
        await adjustQuantity(tx, bId, line.itemTypeId, targetHolderId, sId, line.quantity);
      }
    }
    await tx.signature.update({ where: { token }, data: { status: "SIGNED", signatureData, signedAt: new Date() } });
    await tx.transfer.update({ where: { id: t.id }, data: { status: "COMPLETED", approvedAt: new Date() } });
  });

  await audit(null, "COMPANY_SIGN", "Signature", sig.id);
  revalidatePath("/signatures");
  return { ok: true };
}
