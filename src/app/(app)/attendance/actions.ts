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
    const canManage = can(user.role, "attendance.manage");
    const canView = can(user.role, "attendance.view");
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

export async function assignSquad(
  soldierId: string,
  squadId: string | null,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    if (!can(user.role, "attendance.manage") && !can(user.role, "battalion.profile"))
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
