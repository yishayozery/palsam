"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

type SoldierAssignment = {
  soldierId: string;
  role: string;
  seatIndex: number;
};

export async function saveTemplate(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireCapability("dispatch.manage");
    const bId = user.battalionId!;

    const id = String(formData.get("id") || "").trim() || undefined;
    const name = String(formData.get("name") || "").trim();
    const vehicleSerialUnitId = String(formData.get("vehicleSerialUnitId") || "").trim();
    let assignments: SoldierAssignment[] = [];
    try { assignments = JSON.parse(String(formData.get("assignments") || "[]")); } catch { return { error: "פורמט חיילים שגוי" }; }

    if (!name) return { error: "הזן שם לשבצ\"ק" };
    if (!vehicleSerialUnitId) return { error: "בחר רכב" };
    if (assignments.length === 0) return { error: "הוסף לפחות חייל אחד" };

    const hasDriver = assignments.some((a) => a.role === "נהג");
    if (!hasDriver) return { error: "חייב להגדיר נהג" };

    const vehicle = await prisma.serialUnit.findUnique({
      where: { id: vehicleSerialUnitId },
      select: { battalionId: true, itemType: { select: { id: true, requiredLicenses: { select: { licenseTypeId: true } } } } },
    });
    if (!vehicle || vehicle.battalionId !== bId) return { error: "רכב לא נמצא" };

    const requiredLicenseIds = vehicle.itemType.requiredLicenses.map((rl) => rl.licenseTypeId);

    if (requiredLicenseIds.length > 0) {
      const driverIds = assignments.filter((a) => a.role === "נהג").map((a) => a.soldierId);
      const driversWithLicenses = await prisma.soldierDrivingLicense.findMany({
        where: { soldierId: { in: driverIds }, licenseTypeId: { in: requiredLicenseIds } },
        select: { soldierId: true },
      });
      const qualifiedDrivers = new Set(driversWithLicenses.map((d) => d.soldierId));
      const unqualified = driverIds.filter((id) => !qualifiedDrivers.has(id));
      if (unqualified.length > 0) {
        const names = await prisma.soldier.findMany({ where: { id: { in: unqualified } }, select: { fullName: true } });
        return { error: `לנהג/ים ${names.map((n) => n.fullName).join(", ")} אין הרשאת נהיגה מתאימה לרכב זה` };
      }
    }

    if (id) {
      const existing = await prisma.dispatchTemplate.findUnique({ where: { id }, select: { battalionId: true } });
      if (!existing || existing.battalionId !== bId) return { error: "תבנית לא נמצאה" };
      await prisma.$transaction(async (tx) => {
        await tx.dispatchTemplate.update({ where: { id }, data: { name, vehicleSerialUnitId } });
        await tx.dispatchTemplateSoldier.deleteMany({ where: { templateId: id } });
        await tx.dispatchTemplateSoldier.createMany({
          data: assignments.map((a) => ({
            templateId: id!,
            soldierId: a.soldierId,
            role: a.role,
            seatIndex: a.seatIndex,
          })),
        });
      });
      await audit(user.id, "UPDATE", "DispatchTemplate", id, { name, soldierCount: assignments.length });
    } else {
      const created = await prisma.$transaction(async (tx) => {
        const t = await tx.dispatchTemplate.create({
          data: { battalionId: bId, name, vehicleSerialUnitId, createdById: user.id },
        });
        await tx.dispatchTemplateSoldier.createMany({
          data: assignments.map((a) => ({
            templateId: t.id,
            soldierId: a.soldierId,
            role: a.role,
            seatIndex: a.seatIndex,
          })),
        });
        return t;
      });
      await audit(user.id, "CREATE", "DispatchTemplate", created.id, { name, soldierCount: assignments.length });
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
