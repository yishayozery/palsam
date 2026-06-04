"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import type { SignatureMethod } from "@/generated/prisma";

/** יצירת החתמה (SIGNOUT): מחזיק ◄ חייל. */
export async function createSignout(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "signatures.manage")) redirect("/signatures");
  const bId = user.battalionId!;
  const soldierId = String(formData.get("soldierId") || "");
  const method = String(formData.get("method") || "QR") as SignatureMethod;
  const serialIds = formData.getAll("serial").map(String).filter(Boolean);
  const vehicleId = String(formData.get("vehicleId") || "") || null;
  const kitId = String(formData.get("kitId") || "") || null;
  if (!soldierId || (serialIds.length === 0 && !kitId)) return;

  // אם נבחרה ערכה — נוסיף את הפריטים הכמותיים שלה כשורות העברה
  const kitLines = kitId
    ? await prisma.signableKitLine.findMany({ where: { kitId }, include: { itemType: true } })
    : [];

  const token = nanoid(24);
  let transferId = "";
  await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: { battalionId: bId, type: "SIGNOUT", status: "PENDING", toSoldierId: soldierId, fromHolderId: user.holderId, createdById: user.id, notes: kitId ? "החתמה על ערכה" : null },
    });
    transferId = transfer.id;
    // יחידות סריאליות שנבחרו ידנית
    for (const sid of serialIds) {
      const su = await tx.serialUnit.findUnique({ where: { id: sid } });
      if (!su) continue;
      await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId: su.itemTypeId, quantity: su.lotQuantity ?? 1, serialUnitId: sid, statusId: su.statusId } });
      // עדכון מיקום ברכב (אם נבחר)
      if (vehicleId) {
        await tx.serialUnit.update({ where: { id: sid }, data: { vehicleId } });
      }
    }
    // פריטים מהערכה (כמותיים)
    for (const l of kitLines) {
      if (l.itemType.trackingMethod === "QUANTITY") {
        const status = await tx.itemStatus.findFirst({ where: { battalionId: bId, isDefault: true } });
        await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId: l.itemTypeId, quantity: l.quantity, statusId: status?.id } });
      }
    }
    await tx.signature.create({
      data: { battalionId: bId, soldierId, transferId: transfer.id, method, status: "PENDING", token, tokenExpires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) },
    });
  });

  await audit(user.id, "CREATE_SIGNOUT", "Transfer", transferId, { soldierId, method });
  revalidatePath("/signatures");
  redirect(`/signatures/${token}`);
}

/** השלמת חתימה (ציבורי) */
export async function completeSignature(token: string, signatureData: string) {
  const sig = await prisma.signature.findUnique({ where: { token }, include: { transfer: { include: { lines: true } } } });
  if (!sig || sig.status !== "PENDING" || !sig.transfer) return { ok: false, error: "החתימה אינה זמינה או כבר בוצעה" };
  if (sig.tokenExpires && sig.tokenExpires < new Date()) {
    await prisma.signature.update({ where: { token }, data: { status: "EXPIRED" } });
    return { ok: false, error: "פג תוקף הקישור" };
  }

  if (!sig.soldierId) return { ok: false, error: "סוג חתימה לא תואם" };
  const soldierId = sig.soldierId;
  await prisma.$transaction(async (tx) => {
    for (const line of sig.transfer!.lines) {
      if (line.serialUnitId) {
        await tx.serialUnit.update({ where: { id: line.serialUnitId }, data: { signedSoldierId: soldierId } });
      }
    }
    await tx.signature.update({ where: { token }, data: { status: "SIGNED", signatureData, signedAt: new Date() } });
    await tx.transfer.update({ where: { id: sig.transferId! }, data: { status: "COMPLETED", approvedAt: new Date() } });
  });

  await audit(null, "SIGN", "Signature", sig.id, { soldierId });
  revalidatePath("/signatures");
  return { ok: true };
}

/** זיכוי מהיר (Fast Check-in) */
export async function checkinSerial(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "signatures.manage")) redirect("/signatures");
  const bId = user.battalionId!;
  const serialUnitId = String(formData.get("serialUnitId") || "");
  const statusId = String(formData.get("statusId") || "");

  const su = await prisma.serialUnit.findUnique({ where: { id: serialUnitId }, include: { signedSoldier: true } });
  if (!su || !su.signedSoldierId) return;

  await prisma.$transaction(async (tx) => {
    await tx.serialUnit.update({ where: { id: serialUnitId }, data: { signedSoldierId: null, ...(statusId ? { statusId } : {}) } });
    await tx.transfer.create({
      data: {
        battalionId: bId, type: "CHECKIN", status: "COMPLETED", toHolderId: su.currentHolderId, createdById: user.id, approvedById: user.id, approvedAt: new Date(), reason: "זיכוי מהיר",
        lines: { create: { itemTypeId: su.itemTypeId, quantity: su.lotQuantity ?? 1, serialUnitId: su.id, statusId: statusId || su.statusId } },
      },
    });
  });

  await audit(user.id, "CHECKIN", "SerialUnit", serialUnitId, { soldier: su.signedSoldier?.fullName });
  revalidatePath("/signatures");
}

/** עדכון מיקום פיזי (אחריות מול מיקום) */
export async function updatePhysicalLocation(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "signatures.manage")) redirect("/signatures");
  const serialUnitId = String(formData.get("serialUnitId") || "");
  const physicalLocation = String(formData.get("physicalLocation") || "").trim() || null;
  await prisma.serialUnit.update({ where: { id: serialUnitId }, data: { physicalLocation } });
  await audit(user.id, "UPDATE_LOCATION", "SerialUnit", serialUnitId, { physicalLocation });
  revalidatePath("/signatures");
}
