"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";

/** מפקד מעלה שאלה / תקלה / צורך */
export async function submitQuestion(formData: FormData) {
  const user = await requireUser();
  const question = String(formData.get("question") || "").trim();
  if (!question || !user.battalionId) return;
  const category = String(formData.get("category") || "שאלה").trim() || "שאלה";
  await prisma.supportQuestion.create({
    data: { battalionId: user.battalionId, askedById: user.id, askedByName: user.fullName, category, question },
  });
  revalidatePath("/support");
}

/** אדמין עונה על שאלה */
export async function answerQuestion(formData: FormData) {
  const user = await requireUser();
  if (!can(user, "battalion.profile") && !user.isSuperAdmin) return;
  const id = String(formData.get("id") || "");
  const answer = String(formData.get("answer") || "").trim();
  const q = await prisma.supportQuestion.findUnique({ where: { id }, select: { battalionId: true } });
  if (!q || (!user.isSuperAdmin && q.battalionId !== user.battalionId)) return;
  await prisma.supportQuestion.update({
    where: { id },
    data: { answer: answer || null, status: answer ? "ANSWERED" : "OPEN", answeredById: user.id, answeredAt: answer ? new Date() : null },
  });
  revalidatePath("/support");
}

export async function deleteQuestion(formData: FormData) {
  const user = await requireUser();
  if (!can(user, "battalion.profile") && !user.isSuperAdmin) return;
  const id = String(formData.get("id") || "");
  const q = await prisma.supportQuestion.findUnique({ where: { id }, select: { battalionId: true } });
  if (!q || (!user.isSuperAdmin && q.battalionId !== user.battalionId)) return;
  await prisma.supportQuestion.delete({ where: { id } });
  revalidatePath("/support");
}

/** אדמין-על: הגדרת כפתור ווטסאפ לתמיכה (גלובלי) */
export async function saveSupportConfig(formData: FormData) {
  const user = await requireUser();
  if (!user.isSuperAdmin) return;
  const number = String(formData.get("supportWhatsappNumber") || "").replace(/\D/g, "") || null;
  const enabled = !!number; // נוכחות מספר = מופעל
  const message = String(formData.get("supportMessage") || "").trim() || null;
  await prisma.appConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", supportWhatsappEnabled: enabled, supportWhatsappNumber: number, supportMessage: message },
    update: { supportWhatsappEnabled: enabled, supportWhatsappNumber: number, supportMessage: message },
  });
  await audit(user.id, "UPDATE_SUPPORT_CONFIG", "AppConfig", "singleton", { enabled });
  revalidatePath("/support");
}
