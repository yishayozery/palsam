"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";

export async function saveAttendance(
  entries: { soldierId: string; date: string; statusId: string | null; type: "plan" | "record" }[],
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const canManage = can(user, "attendance.manage");
    const canView = can(user, "attendance.view");
    if (!canManage && !canView) return { error: "אין הרשאה" };

    for (const entry of entries) {
      const dateObj = new Date(entry.date + "T00:00:00Z");
      if (entry.type === "plan") {
        if (entry.statusId) {
          await prisma.attendancePlan.upsert({
            where: { soldierId_date: { soldierId: entry.soldierId, date: dateObj } },
            update: { statusId: entry.statusId, updatedById: user.id },
            create: { soldierId: entry.soldierId, date: dateObj, statusId: entry.statusId, updatedById: user.id },
          });
        } else {
          await prisma.attendancePlan.deleteMany({
            where: { soldierId: entry.soldierId, date: dateObj },
          });
        }
      } else {
        if (entry.statusId) {
          await prisma.attendanceRecord.upsert({
            where: { soldierId_date: { soldierId: entry.soldierId, date: dateObj } },
            update: { statusId: entry.statusId, updatedById: user.id },
            create: { soldierId: entry.soldierId, date: dateObj, statusId: entry.statusId, updatedById: user.id },
          });
        } else {
          await prisma.attendanceRecord.deleteMany({
            where: { soldierId: entry.soldierId, date: dateObj },
          });
        }
      }
    }

    revalidatePath("/attendance");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

// ===================== שמ"פ (שירות מילואים פעיל) =====================

export async function openCallup(
  soldierId: string,
  startDate: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    if (!can(user, "attendance.manage")) return { error: "אין הרשאה" };
    const existing = await prisma.callupPeriod.findFirst({
      where: { soldierId, endDate: null },
    });
    if (existing) return { error: "לחייל כבר יש שמ\"פ פתוח" };
    await prisma.callupPeriod.create({
      data: {
        soldierId,
        startDate: new Date(startDate + "T00:00:00Z"),
        createdById: user.id,
      },
    });
    revalidatePath("/attendance");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function closeCallup(
  callupId: string,
  endDate: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    if (!can(user, "attendance.manage")) return { error: "אין הרשאה" };
    const period = await prisma.callupPeriod.findUnique({ where: { id: callupId } });
    if (!period) return { error: "תקופת שמ\"פ לא נמצאה" };
    if (period.endDate) return { error: "שמ\"פ כבר סגור" };
    await prisma.callupPeriod.update({
      where: { id: callupId },
      data: { endDate: new Date(endDate + "T00:00:00Z"), closedById: user.id, closedAt: new Date() },
    });
    revalidatePath("/attendance");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function deleteCallup(
  callupId: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    if (!can(user, "attendance.manage")) return { error: "אין הרשאה" };
    await prisma.callupPeriod.delete({ where: { id: callupId } });
    revalidatePath("/attendance");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function assignSquad(
  soldierId: string,
  squadId: string | null,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    if (!can(user, "attendance.manage") && !can(user, "battalion.profile"))
      return { error: "אין הרשאה" };
    await prisma.soldier.update({
      where: { id: soldierId },
      data: { squadId },
    });
    revalidatePath("/attendance");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}
