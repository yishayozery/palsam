"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

type SlotAssignment = {
  dispatchRoleId: string;
  soldierId: string | null;
  seatIndex: number;
};

export async function saveTemplate(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireCapability("dispatch.manage");
    const bId = user.battalionId!;

    const id = String(formData.get("id") || "").trim() || undefined;
    const name = String(formData.get("name") || "").trim();
    const vehicleItemTypeId = String(formData.get("vehicleItemTypeId") || "").trim() || null;
    const vehicleSerialUnitId = String(formData.get("vehicleSerialUnitId") || "").trim() || null;
    const roundStr = String(formData.get("round") || "").trim();
    const roundParsed = roundStr ? parseInt(roundStr, 10) || null : null;
    // סבבים אוחדו ל-1..3 — נרמול הגנתי כדי שלא יישמר ערך מחוץ לטווח
    const round = roundParsed != null ? Math.min(3, Math.max(1, roundParsed)) : null;
    const companyId = String(formData.get("companyId") || "").trim() || null;
    let slots: SlotAssignment[] = [];
    try { slots = JSON.parse(String(formData.get("slots") || "[]")); } catch { return { error: "פורמט שגוי" }; }

    if (!name) return { error: 'הזן שם לשבצ"ק' };

    // Validate driver license if specific vehicle is selected
    if (vehicleSerialUnitId) {
      const vehicle = await prisma.serialUnit.findUnique({
        where: { id: vehicleSerialUnitId },
        select: { battalionId: true, itemType: { select: { id: true, requiredLicenses: { select: { licenseTypeId: true } } } } },
      });
      if (!vehicle || vehicle.battalionId !== bId) return { error: "רכב לא נמצא" };

      const requiredLicenseIds = vehicle.itemType.requiredLicenses.map((rl) => rl.licenseTypeId);
      if (requiredLicenseIds.length > 0) {
        const driverRoles = await prisma.dispatchRole.findMany({ where: { battalionId: bId, isDriver: true }, select: { id: true } });
        const driverRoleIds = new Set(driverRoles.map((r) => r.id));
        const driverSoldierIds = slots.filter((s) => driverRoleIds.has(s.dispatchRoleId) && s.soldierId).map((s) => s.soldierId!);

        if (driverSoldierIds.length > 0) {
          const driversWithLicenses = await prisma.soldierDrivingLicense.findMany({
            where: { soldierId: { in: driverSoldierIds }, licenseTypeId: { in: requiredLicenseIds } },
            select: { soldierId: true },
          });
          const qualified = new Set(driversWithLicenses.map((d) => d.soldierId));
          const unqualified = driverSoldierIds.filter((id) => !qualified.has(id));
          if (unqualified.length > 0) {
            const names = await prisma.soldier.findMany({ where: { id: { in: unqualified } }, select: { fullName: true } });
            return { error: `לנהג/ים ${names.map((n) => n.fullName).join(", ")} אין הרשאת נהיגה מתאימה לרכב זה` };
          }
        }
      }
    }

    const data = {
      name,
      vehicleItemTypeId,
      vehicleSerialUnitId,
      round,
      companyId,
    };

    if (id) {
      const existing = await prisma.dispatchTemplate.findUnique({ where: { id }, select: { battalionId: true } });
      if (!existing || existing.battalionId !== bId) return { error: "תבנית לא נמצאה" };
      await prisma.$transaction(async (tx) => {
        await tx.dispatchTemplate.update({ where: { id }, data });
        await tx.dispatchTemplateSoldier.deleteMany({ where: { templateId: id } });
        if (slots.length > 0) {
          await tx.dispatchTemplateSoldier.createMany({
            data: slots.map((s) => ({
              templateId: id!,
              dispatchRoleId: s.dispatchRoleId,
              soldierId: s.soldierId || null,
              seatIndex: s.seatIndex,
            })),
          });
        }
      });
      await audit(user.id, "UPDATE", "DispatchTemplate", id, { name, slotCount: slots.length });
    } else {
      const created = await prisma.$transaction(async (tx) => {
        const t = await tx.dispatchTemplate.create({
          data: { battalionId: bId, ...data, createdById: user.id },
        });
        if (slots.length > 0) {
          await tx.dispatchTemplateSoldier.createMany({
            data: slots.map((s) => ({
              templateId: t.id,
              dispatchRoleId: s.dispatchRoleId,
              soldierId: s.soldierId || null,
              seatIndex: s.seatIndex,
            })),
          });
        }
        return t;
      });
      await audit(user.id, "CREATE", "DispatchTemplate", created.id, { name, slotCount: slots.length });
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

export async function saveDispatchRole(formData: FormData) {
  const user = await requireCapability("dispatch.manage");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const icon = String(formData.get("icon") || "🎖️").trim();
  const isDriver = formData.get("isDriver") === "on" || formData.get("isDriver") === "true";
  const companyRoleId = String(formData.get("companyRoleId") || "").trim() || null;
  const sortOrder = parseInt(String(formData.get("sortOrder") || "0"), 10) || 0;
  if (!name) return;

  if (id) {
    await prisma.dispatchRole.update({ where: { id }, data: { name, icon, isDriver, companyRoleId, sortOrder } });
  } else {
    await prisma.dispatchRole.create({ data: { battalionId: bId, name, icon, isDriver, companyRoleId, sortOrder } });
  }
  await audit(user.id, id ? "UPDATE" : "CREATE", "DispatchRole", id || name);
  revalidatePath("/dispatch/templates");
}

export async function toggleDispatchRole(formData: FormData) {
  const user = await requireCapability("dispatch.manage");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const existing = await prisma.dispatchRole.findUnique({ where: { id } });
  if (!existing || existing.battalionId !== bId) return;
  await prisma.dispatchRole.update({ where: { id }, data: { active: !existing.active } });
  await audit(user.id, "TOGGLE", "DispatchRole", id);
  revalidatePath("/dispatch/templates");
}
