"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import type { SignatureMethod } from "@/generated/prisma";

function canSign(role: import("@/generated/prisma").Role) {
  return (
    can(role, "company.manage") ||
    can(role, "armory.manage") ||
    can(role, "warehouse.manage")
  );
}

/**
 * יצירת החתמה (SIGNOUT): מחזיק ◄ חייל.
 * יוצר העברת SIGNOUT (PENDING) + רשומת Signature עם טוקן לקישור/QR.
 * השיטה ONSITE מאפשרת חתימה מיידית על מכשיר האחראי.
 */
export async function createSignout(formData: FormData) {
  const user = await requireUser();
  if (!canSign(user.role)) redirect("/signatures");

  const soldierId = String(formData.get("soldierId") || "");
  const method = String(formData.get("method") || "QR") as SignatureMethod;
  const serialIds = formData.getAll("serial").map(String).filter(Boolean);
  if (!soldierId || serialIds.length === 0) return;

  const token = nanoid(24);
  let transferId = "";

  await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: {
        type: "SIGNOUT",
        status: "PENDING",
        toSoldierId: soldierId,
        fromHolderId: user.holderId,
        createdById: user.id,
      },
    });
    transferId = transfer.id;

    for (const sid of serialIds) {
      const su = await tx.serialUnit.findUnique({ where: { id: sid } });
      if (!su) continue;
      await tx.transferLine.create({
        data: {
          transferId: transfer.id,
          itemTypeId: su.itemTypeId,
          quantity: su.lotQuantity ?? 1,
          serialUnitId: sid,
          statusId: su.statusId,
        },
      });
    }

    await tx.signature.create({
      data: {
        soldierId,
        transferId: transfer.id,
        method,
        status: "PENDING",
        token,
        tokenExpires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      },
    });
  });

  await audit(user.id, "CREATE_SIGNOUT", "Transfer", transferId, { soldierId, method });
  revalidatePath("/signatures");
  redirect(`/signatures/${token}`);
}

/** השלמת חתימה (ציבורי — נקרא מדף ההחתמה של החייל) */
export async function completeSignature(token: string, signatureData: string) {
  const sig = await prisma.signature.findUnique({
    where: { token },
    include: { transfer: { include: { lines: true } } },
  });
  if (!sig || sig.status !== "PENDING" || !sig.transfer) {
    return { ok: false, error: "החתימה אינה זמינה או כבר בוצעה" };
  }
  if (sig.tokenExpires && sig.tokenExpires < new Date()) {
    await prisma.signature.update({ where: { token }, data: { status: "EXPIRED" } });
    return { ok: false, error: "פג תוקף הקישור" };
  }

  await prisma.$transaction(async (tx) => {
    // החייל חותם משפטית — signedSoldierId מתעדכן (אחריות), המיקום הארגוני נשמר
    for (const line of sig.transfer!.lines) {
      if (line.serialUnitId) {
        await tx.serialUnit.update({
          where: { id: line.serialUnitId },
          data: { signedSoldierId: sig.soldierId },
        });
      }
    }
    await tx.signature.update({
      where: { token },
      data: { status: "SIGNED", signatureData, signedAt: new Date() },
    });
    await tx.transfer.update({
      where: { id: sig.transferId! },
      data: { status: "COMPLETED", approvedAt: new Date() },
    });
  });

  await audit(null, "SIGN", "Signature", sig.id, { soldierId: sig.soldierId });
  revalidatePath("/signatures");
  return { ok: true };
}

/** זיכוי מהיר (Fast Check-in) — המאשר מזכה את החייל ללא חתימה מחדש */
export async function checkinSerial(formData: FormData) {
  const user = await requireUser();
  if (!canSign(user.role)) redirect("/signatures");
  const serialUnitId = String(formData.get("serialUnitId") || "");
  const statusId = String(formData.get("statusId") || "");

  const su = await prisma.serialUnit.findUnique({
    where: { id: serialUnitId },
    include: { signedSoldier: true },
  });
  if (!su || !su.signedSoldierId) return;

  await prisma.$transaction(async (tx) => {
    await tx.serialUnit.update({
      where: { id: serialUnitId },
      data: {
        signedSoldierId: null,
        ...(statusId ? { statusId } : {}),
      },
    });
    await tx.transfer.create({
      data: {
        type: "CHECKIN",
        status: "COMPLETED",
        toHolderId: su.currentHolderId,
        createdById: user.id,
        approvedById: user.id,
        approvedAt: new Date(),
        reason: "זיכוי מהיר",
        lines: {
          create: {
            itemTypeId: su.itemTypeId,
            quantity: su.lotQuantity ?? 1,
            serialUnitId: su.id,
            statusId: statusId || su.statusId,
          },
        },
      },
    });
  });

  await audit(user.id, "CHECKIN", "SerialUnit", serialUnitId, { soldier: su.signedSoldier?.fullName });
  revalidatePath("/signatures");
}

/** עדכון מיקום פיזי (אחריות מול מיקום) — ללא שינוי החתום */
export async function updatePhysicalLocation(formData: FormData) {
  const user = await requireUser();
  if (!canSign(user.role)) redirect("/signatures");
  const serialUnitId = String(formData.get("serialUnitId") || "");
  const physicalLocation = String(formData.get("physicalLocation") || "").trim() || null;
  await prisma.serialUnit.update({ where: { id: serialUnitId }, data: { physicalLocation } });
  await audit(user.id, "UPDATE_LOCATION", "SerialUnit", serialUnitId, { physicalLocation });
  revalidatePath("/signatures");
}
