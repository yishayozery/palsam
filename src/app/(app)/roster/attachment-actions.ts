"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

export async function createAttachmentRequest(formData: FormData) {
  const user = await requireCapability("soldiers.roster");
  const bId = user.battalionId!;
  const soldierId = String(formData.get("soldierId") || "");
  const fromDate = String(formData.get("fromDate") || "");
  const toDate = String(formData.get("toDate") || "");
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!soldierId || !fromDate || !toDate) throw new Error("חסרים שדות חובה");

  const soldier = await prisma.soldier.findUnique({ where: { id: soldierId } });
  if (!soldier || soldier.battalionId !== bId) throw new Error("חייל לא נמצא");

  if (new Date(toDate) < new Date(fromDate)) throw new Error("תאריך סיום חייב להיות אחרי תאריך התחלה");

  await prisma.attachmentRequest.create({
    data: {
      battalionId: bId,
      soldierId,
      fromDate: new Date(fromDate),
      toDate: new Date(toDate),
      requestedById: user.id,
      notes,
    },
  });

  await audit(user.id, "CREATE_ATTACHMENT_REQUEST", "AttachmentRequest", soldierId, { fromDate, toDate });
  revalidatePath("/roster");
}

export async function approveAttachmentRequest(formData: FormData) {
  const user = await requireCapability("soldiers.roster");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");

  const req = await prisma.attachmentRequest.findUnique({
    where: { id },
    include: { soldier: true },
  });
  if (!req || req.battalionId !== bId) throw new Error("בקשה לא נמצאה");
  if (req.status !== "PENDING") throw new Error("הבקשה כבר טופלה");

  await prisma.$transaction([
    prisma.attachmentRequest.update({
      where: { id },
      data: { status: "APPROVED", respondedById: user.id, respondedAt: new Date() },
    }),
    prisma.soldier.update({
      where: { id: req.soldierId },
      data: { attached: true },
    }),
  ]);

  await audit(user.id, "APPROVE_ATTACHMENT", "AttachmentRequest", id);
  revalidatePath("/roster");
}

export async function rejectAttachmentRequest(formData: FormData) {
  const user = await requireCapability("soldiers.roster");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");

  const req = await prisma.attachmentRequest.findUnique({ where: { id } });
  if (!req || req.battalionId !== bId) throw new Error("בקשה לא נמצאה");
  if (req.status !== "PENDING") throw new Error("הבקשה כבר טופלה");

  await prisma.attachmentRequest.update({
    where: { id },
    data: { status: "REJECTED", respondedById: user.id, respondedAt: new Date() },
  });

  await audit(user.id, "REJECT_ATTACHMENT", "AttachmentRequest", id);
  revalidatePath("/roster");
}
