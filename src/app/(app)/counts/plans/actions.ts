"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { generatePendingTasks } from "@/lib/countScheduler";

function listFrom(fd: FormData, name: string): string[] {
  return fd.getAll(name).map(String).filter(Boolean);
}

export async function createCountPlan(formData: FormData) {
  const user = await requireCapability("counts.manage");
  const bId = user.battalionId!;
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  if (!name) throw new Error("שם תכנית חובה");

  const scopeHolderIds = listFrom(formData, "scopeHolderIds");
  const scopeCategoryIds = listFrom(formData, "scopeCategoryIds");
  const scopeItemTypeIds = listFrom(formData, "scopeItemTypeIds");
  const trackingMethods = listFrom(formData, "trackingMethods");

  const frequencyDays = Math.max(0, parseInt(String(formData.get("frequencyDays") || "1"), 10) || 1);
  const scheduledTimes = String(formData.get("scheduledTimes") || "")
    .split(/[,\s]+/).map((s) => s.trim()).filter((s) => /^\d{1,2}:\d{2}$/.test(s));
  const daysOfWeek = listFrom(formData, "daysOfWeek").map(Number).filter((n) => n >= 0 && n <= 6);
  const graceMinutes = Math.max(0, parseInt(String(formData.get("graceMinutes") || "60"), 10) || 60);
  // טווח תאריכים אופציונלי
  const startDateRaw = String(formData.get("startDate") || "").trim();
  const endDateRaw = String(formData.get("endDate") || "").trim();
  const startDate = startDateRaw ? new Date(startDateRaw) : null;
  const endDate = endDateRaw ? new Date(endDateRaw) : null;
  // אחראי ספירה — אופציונלי
  const responsibleUserId = String(formData.get("responsibleUserId") || "").trim() || null;

  const plan = await prisma.countPlan.create({
    data: {
      battalionId: bId, name, description,
      scopeHolderIds, scopeCategoryIds, scopeItemTypeIds, trackingMethods,
      frequencyDays, scheduledTimes, daysOfWeek, graceMinutes,
      startDate, endDate,
      createdById: user.id,
      responsibleUserId: responsibleUserId ?? user.id,
    },
  });
  // יצירת משימה מיידית לבדיקה (אם הזמן הבא כבר עבר)
  await generatePendingTasks();

  await audit(user.id, "CREATE_COUNT_PLAN", "CountPlan", plan.id, { name });
  revalidatePath("/counts/plans");
  revalidatePath("/counts");
}

export async function toggleCountPlan(formData: FormData) {
  const user = await requireCapability("counts.manage");
  const id = String(formData.get("id") || "");
  const plan = await prisma.countPlan.findUnique({ where: { id } });
  if (!plan || plan.battalionId !== user.battalionId) return;
  await prisma.countPlan.update({ where: { id }, data: { active: !plan.active } });
  if (!plan.active) await generatePendingTasks();
  await audit(user.id, "UPDATE_COUNT_PLAN", "CountPlan", id, { active: !plan.active });
  revalidatePath("/counts/plans");
  revalidatePath("/counts");
}

export async function deleteCountPlan(formData: FormData) {
  const user = await requireCapability("counts.manage");
  const id = String(formData.get("id") || "");
  const plan = await prisma.countPlan.findUnique({ where: { id } });
  if (!plan || plan.battalionId !== user.battalionId) return;
  await prisma.countPlan.delete({ where: { id } });
  await audit(user.id, "DELETE_COUNT_PLAN", "CountPlan", id);
  revalidatePath("/counts/plans");
}
