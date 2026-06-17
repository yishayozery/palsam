"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability, requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export async function upsertAttendanceStatus(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireCapability("battalion.profile");
    const bId = user.battalionId!;
    const id = String(formData.get("id") || "");
    const name = String(formData.get("name") || "").trim();
    const color = String(formData.get("color") || "#10b981");
    const icon = String(formData.get("icon") || "").trim() || null;
    const isPresent = formData.get("isPresent") === "true";
    const sortOrder = parseInt(String(formData.get("sortOrder") || "0"), 10);

    if (!name) return { error: "שם סטטוס חובה" };

    if (id) {
      await prisma.attendanceStatus.update({
        where: { id },
        data: { name, color, icon, isPresent, sortOrder },
      });
      await audit(user.id, "UPDATE", "AttendanceStatus", id, { name });
    } else {
      const created = await prisma.attendanceStatus.create({
        data: { battalionId: bId, name, color, icon, isPresent, sortOrder },
      });
      await audit(user.id, "CREATE", "AttendanceStatus", created.id, { name });
    }

    revalidatePath("/attendance-settings");
    return { ok: true };
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("Unique constraint"))
      return { error: "סטטוס עם שם זהה כבר קיים" };
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function deleteAttendanceStatus(
  id: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireCapability("battalion.profile");
    const used = await prisma.attendancePlan.count({ where: { statusId: id } })
      + await prisma.attendanceRecord.count({ where: { statusId: id } });
    if (used > 0) return { error: "לא ניתן למחוק סטטוס שנמצא בשימוש. ניתן לכבות אותו." };
    await prisma.attendanceStatus.delete({ where: { id } });
    await audit(user.id, "DELETE", "AttendanceStatus", id, {});
    revalidatePath("/attendance-settings");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function toggleAttendanceStatus(
  id: string,
  active: boolean,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireCapability("battalion.profile");
    await prisma.attendanceStatus.update({ where: { id }, data: { active } });
    revalidatePath("/attendance-settings");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

// ===================== מחלקות (Squads) =====================

export async function upsertSquad(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const bId = user.battalionId!;
    const id = String(formData.get("id") || "");
    const companyId = String(formData.get("companyId") || "");
    const name = String(formData.get("name") || "").trim();
    const sortOrder = parseInt(String(formData.get("sortOrder") || "0"), 10);

    if (!companyId || !name) return { error: "פלוגה ושם חובה" };

    const isBattalionAdmin = can(user.role, "battalion.profile");
    const isCompanyRep = user.role === "COMPANY_REP" && user.holderIds.includes(companyId);
    if (!isBattalionAdmin && !isCompanyRep) return { error: "אין הרשאה" };

    if (id) {
      const existing = await prisma.squad.findUnique({ where: { id }, select: { companyId: true } });
      if (!existing) return { error: "מחלקה לא נמצאה" };
      if (!isBattalionAdmin && !user.holderIds.includes(existing.companyId)) return { error: "אין הרשאה" };
      await prisma.squad.update({
        where: { id },
        data: { name, sortOrder },
      });
    } else {
      await prisma.squad.create({
        data: { battalionId: bId, companyId, name, sortOrder },
      });
    }

    revalidatePath("/attendance-settings");
    revalidatePath("/attendance");
    return { ok: true };
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("Unique constraint"))
      return { error: "מחלקה עם שם זהה כבר קיימת בפלוגה" };
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function deleteSquad(
  id: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const squad = await prisma.squad.findUnique({ where: { id }, select: { companyId: true } });
    if (!squad) return { error: "לא נמצא" };

    const isBattalionAdmin = can(user.role, "battalion.profile");
    const isCompanyRep = user.role === "COMPANY_REP" && user.holderIds.includes(squad.companyId);
    if (!isBattalionAdmin && !isCompanyRep) return { error: "אין הרשאה" };

    const assigned = await prisma.soldier.count({ where: { squadId: id } });
    if (assigned > 0) return { error: `לא ניתן למחוק — ${assigned} חיילים משויכים. העבר אותם קודם.` };
    await prisma.squad.delete({ where: { id } });
    revalidatePath("/attendance-settings");
    revalidatePath("/attendance");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}
