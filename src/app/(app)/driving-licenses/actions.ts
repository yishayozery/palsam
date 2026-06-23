"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability, requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export async function saveLicenseType(formData: FormData) {
  const user = await requireCapability("dispatch.manage");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!name) return;

  if (id) {
    const existing = await prisma.drivingLicenseType.findUnique({ where: { id } });
    if (!existing || existing.battalionId !== bId) return;
    await prisma.drivingLicenseType.update({ where: { id }, data: { name } });
  } else {
    await prisma.drivingLicenseType.create({ data: { battalionId: bId, name } });
  }
  await audit(user.id, "UPSERT", "DrivingLicenseType", id || "new", { name });
  revalidatePath("/driving-licenses");
}

export async function toggleLicenseType(formData: FormData) {
  const user = await requireCapability("dispatch.manage");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const existing = await prisma.drivingLicenseType.findUnique({ where: { id } });
  if (!existing || existing.battalionId !== bId) return;
  await prisma.drivingLicenseType.update({ where: { id }, data: { active: !existing.active } });
  await audit(user.id, "TOGGLE", "DrivingLicenseType", id);
  revalidatePath("/driving-licenses");
}

export async function saveSoldierLicenses(formData: FormData) {
  const user = await requireUser();
  const bId = user.battalionId!;
  const isAdmin = can(user, "battalion.profile");
  const isVehicleOfficer = user.role === "WAREHOUSE_MANAGER";
  if (!isAdmin && !isVehicleOfficer && !can(user, "dispatch.manage")) return;

  const soldierId = String(formData.get("soldierId") || "");
  const soldier = await prisma.soldier.findUnique({ where: { id: soldierId } });
  if (!soldier || soldier.battalionId !== bId) return;

  const licenseTypeIds = formData.getAll("licenseTypeId").map(String);
  const refresherDate = String(formData.get("refresherDate") || "");

  await prisma.$transaction(async (tx) => {
    await tx.soldierDrivingLicense.deleteMany({ where: { soldierId } });
    if (licenseTypeIds.length > 0) {
      await tx.soldierDrivingLicense.createMany({
        data: licenseTypeIds.map((licenseTypeId) => ({
          soldierId,
          licenseTypeId,
        })),
      });
    }
    await tx.soldier.update({
      where: { id: soldierId },
      data: { drivingRefresherDate: refresherDate ? new Date(refresherDate) : null },
    });
  });
  await audit(user.id, "UPDATE_LICENSES", "Soldier", soldierId, { count: licenseTypeIds.length });
  revalidatePath("/driving-licenses");
}

export async function updateRefreshDays(formData: FormData) {
  const user = await requireUser();
  if (!can(user, "battalion.profile")) return;
  const bId = user.battalionId!;
  const days = parseInt(String(formData.get("days") || "180"), 10);
  if (isNaN(days) || days < 1) return;
  await prisma.battalion.update({ where: { id: bId }, data: { drivingRefreshDays: days } });
  await audit(user.id, "UPDATE", "Battalion", bId, { drivingRefreshDays: days });
  revalidatePath("/driving-licenses");
}

export async function saveVehicleTypeLicenses(formData: FormData) {
  const user = await requireUser();
  const bId = user.battalionId!;
  const isAdmin = can(user, "battalion.profile");
  const isVehicleOfficer = user.role === "WAREHOUSE_MANAGER";
  if (!isAdmin && !isVehicleOfficer && !can(user, "dispatch.manage")) return;

  const itemTypeId = String(formData.get("itemTypeId") || "");
  const itemType = await prisma.itemType.findUnique({ where: { id: itemTypeId } });
  if (!itemType || itemType.battalionId !== bId) return;

  const licenseTypeIds = formData.getAll("licenseTypeId").map(String);

  await prisma.$transaction(async (tx) => {
    await tx.vehicleTypeLicense.deleteMany({ where: { itemTypeId } });
    if (licenseTypeIds.length > 0) {
      await tx.vehicleTypeLicense.createMany({
        data: licenseTypeIds.map((licenseTypeId) => ({
          itemTypeId,
          licenseTypeId,
        })),
      });
    }
  });
  await audit(user.id, "UPDATE_VEHICLE_LICENSES", "ItemType", itemTypeId, { count: licenseTypeIds.length });
  revalidatePath("/driving-licenses");
}
