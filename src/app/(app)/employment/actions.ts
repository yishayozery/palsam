"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export async function saveEmployment(
  formData: FormData,
): Promise<{ ok?: boolean; id?: string; error?: string }> {
  try {
    const user = await requireUser();
    if (!canEdit(user, "employment")) return { error: "אין הרשאה" };
    const bId = user.battalionId!;

    const id = formData.get("id") as string | null;
    const name = formData.get("name") as string;
    const startDate = formData.get("startDate") as string;
    const endDate = formData.get("endDate") as string;
    const totalDays = parseInt(formData.get("totalDays") as string, 10);
    const mode = (formData.get("mode") as string) || "daily";

    if (!name || !startDate || !endDate || isNaN(totalDays)) {
      return { error: "חסרים שדות חובה" };
    }

    const data = {
      name,
      startDate: new Date(startDate + "T00:00:00Z"),
      endDate: new Date(endDate + "T00:00:00Z"),
      totalDays,
      mode,
    };

    if (id) {
      const existing = await prisma.employment.findUnique({ where: { id } });
      if (!existing || existing.battalionId !== bId) return { error: "לא נמצא" };
      await prisma.employment.update({ where: { id }, data });
      await audit(user.id, "UPDATE", "Employment", id, data);
      revalidatePath("/employment");
      return { ok: true, id };
    }

    const created = await prisma.employment.create({
      data: { ...data, battalionId: bId },
    });
    await audit(user.id, "CREATE", "Employment", created.id, data);
    revalidatePath("/employment");
    return { ok: true, id: created.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function deleteEmployment(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    if (!canEdit(user, "employment")) return { error: "אין הרשאה" };
    const bId = user.battalionId!;

    const id = formData.get("id") as string;
    if (!id) return { error: "חסר מזהה" };

    const existing = await prisma.employment.findUnique({ where: { id } });
    if (!existing || existing.battalionId !== bId) return { error: "לא נמצא" };

    await prisma.employment.update({ where: { id }, data: { active: false } });
    await audit(user.id, "DELETE", "Employment", id);
    revalidatePath("/employment");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function saveAllocations(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    if (!canEdit(user, "employment")) return { error: "אין הרשאה" };
    const bId = user.battalionId!;

    const employmentId = formData.get("employmentId") as string;
    const allocationsJson = formData.get("allocations") as string;
    if (!employmentId || !allocationsJson) return { error: "חסרים נתונים" };

    const existing = await prisma.employment.findUnique({ where: { id: employmentId } });
    if (!existing || existing.battalionId !== bId) return { error: "לא נמצא" };

    const allocations: { companyId: string; date: string; allocated: number }[] =
      JSON.parse(allocationsJson);

    await prisma.$transaction(async (tx) => {
      await tx.employmentAllocation.deleteMany({ where: { employmentId } });
      if (allocations.length > 0) {
        await tx.employmentAllocation.createMany({
          data: allocations.map((a) => ({
            employmentId,
            companyId: a.companyId,
            date: new Date(a.date + "T00:00:00Z"),
            allocated: a.allocated,
          })),
        });
      }
    });

    await audit(user.id, "UPDATE", "EmploymentAllocation", employmentId, {
      count: allocations.length,
    });
    revalidatePath("/employment");
    revalidatePath(`/employment/${employmentId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}
