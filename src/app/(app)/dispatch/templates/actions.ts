"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

export async function saveTemplate(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireCapability("dispatch.manage");
    const bId = user.battalionId!;

    const id = String(formData.get("id") || "").trim() || undefined;
    const name = String(formData.get("name") || "").trim();
    const vehicleSerialUnitId = String(formData.get("vehicleSerialUnitId") || "").trim();
    let soldierIds: string[] = [];
    try { soldierIds = JSON.parse(String(formData.get("soldierIds") || "[]")); } catch { return { error: "פורמט חיילים שגוי" }; }

    if (!name) return { error: "הזן שם לשבצ\"ק" };
    if (!vehicleSerialUnitId) return { error: "בחר רכב" };
    if (soldierIds.length === 0) return { error: "הוסף לפחות חייל אחד" };

    const vehicle = await prisma.serialUnit.findUnique({
      where: { id: vehicleSerialUnitId },
      select: { battalionId: true, itemType: { select: { category: { select: { warehouseType: true } } } } },
    });
    if (!vehicle || vehicle.battalionId !== bId) return { error: "רכב לא נמצא" };

    if (id) {
      const existing = await prisma.dispatchTemplate.findUnique({ where: { id }, select: { battalionId: true } });
      if (!existing || existing.battalionId !== bId) return { error: "תבנית לא נמצאה" };
      await prisma.$transaction(async (tx) => {
        await tx.dispatchTemplate.update({ where: { id }, data: { name, vehicleSerialUnitId } });
        await tx.dispatchTemplateSoldier.deleteMany({ where: { templateId: id } });
        await tx.dispatchTemplateSoldier.createMany({
          data: soldierIds.map((soldierId) => ({ templateId: id!, soldierId })),
        });
      });
      await audit(user.id, "UPDATE", "DispatchTemplate", id, { name, soldierCount: soldierIds.length });
    } else {
      const created = await prisma.$transaction(async (tx) => {
        const t = await tx.dispatchTemplate.create({
          data: { battalionId: bId, name, vehicleSerialUnitId, createdById: user.id },
        });
        await tx.dispatchTemplateSoldier.createMany({
          data: soldierIds.map((soldierId) => ({ templateId: t.id, soldierId })),
        });
        return t;
      });
      await audit(user.id, "CREATE", "DispatchTemplate", created.id, { name, soldierCount: soldierIds.length });
    }
    revalidatePath("/dispatch/templates");
    revalidatePath("/dispatch");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function deleteTemplate(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireCapability("dispatch.manage");
    const bId = user.battalionId!;
    const id = String(formData.get("id") || "");
    const existing = await prisma.dispatchTemplate.findUnique({ where: { id }, select: { battalionId: true } });
    if (!existing || existing.battalionId !== bId) return { error: "תבנית לא נמצאה" };
    await prisma.dispatchTemplate.update({ where: { id }, data: { active: false } });
    await audit(user.id, "DELETE", "DispatchTemplate", id);
    revalidatePath("/dispatch/templates");
    revalidatePath("/dispatch");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}
