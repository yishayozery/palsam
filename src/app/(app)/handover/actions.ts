"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";

async function guard() {
  const user = await requireUser();
  if (!can(user, "attendance.manage") && !can(user, "company.manage")) throw new Error("אין הרשאה");
  return user;
}

/** יצירת העברת משמרת ריקה — הצ'ק ליסט נבנה ידנית ע"י המשתמש (משימות שמגדירים). */
export async function createHandover(formData: FormData) {
  const user = await guard();
  const bId = user.battalionId!;
  const companyId = String(formData.get("companyId") || "");
  if (!companyId) return;
  const fromRound = parseInt(String(formData.get("fromRound") || ""), 10) || null;
  const toRound = parseInt(String(formData.get("toRound") || ""), 10) || null;
  const title = String(formData.get("title") || "").trim() || null;

  // רס"פ מוגבל לפלוגה שלו
  if (user.role === "COMPANY_REP" && user.holderId && companyId !== user.holderId) return;

  const handover = await prisma.shiftHandover.create({
    data: { battalionId: bId, companyId, fromRound, toRound, title, createdById: user.id },
  });

  await audit(user.id, "CREATE_HANDOVER", "ShiftHandover", handover.id, { companyId });
  revalidatePath("/handover");
}

export async function toggleHandoverItem(formData: FormData) {
  const user = await guard();
  const id = String(formData.get("id") || "");
  const it = await prisma.shiftHandoverItem.findUnique({ where: { id }, select: { done: true, handover: { select: { battalionId: true } } } });
  if (!it || it.handover.battalionId !== user.battalionId) return;
  await prisma.shiftHandoverItem.update({ where: { id }, data: { done: !it.done } });
  revalidatePath("/handover");
}

export async function addHandoverItem(formData: FormData) {
  const user = await guard();
  const handoverId = String(formData.get("handoverId") || "");
  const label = String(formData.get("label") || "").trim();
  if (!label) return;
  const h = await prisma.shiftHandover.findUnique({ where: { id: handoverId }, select: { battalionId: true } });
  if (!h || h.battalionId !== user.battalionId) return;
  await prisma.shiftHandoverItem.create({ data: { handoverId, category: "MANUAL", label, sortOrder: 999 } });
  revalidatePath("/handover");
}

export async function completeHandover(formData: FormData) {
  const user = await guard();
  const id = String(formData.get("id") || "");
  const h = await prisma.shiftHandover.findUnique({ where: { id }, select: { battalionId: true } });
  if (!h || h.battalionId !== user.battalionId) return;
  await prisma.shiftHandover.update({ where: { id }, data: { status: "COMPLETED", completedById: user.id, completedAt: new Date() } });
  await audit(user.id, "COMPLETE_HANDOVER", "ShiftHandover", id);
  revalidatePath("/handover");
}

export async function deleteHandover(formData: FormData) {
  const user = await guard();
  const id = String(formData.get("id") || "");
  const h = await prisma.shiftHandover.findUnique({ where: { id }, select: { battalionId: true } });
  if (!h || h.battalionId !== user.battalionId) return;
  await prisma.shiftHandover.delete({ where: { id } });
  revalidatePath("/handover");
}
