"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireSuperAdmin } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { PRESET_ROLES, type Screen, type UserPermissions, SCREEN_KEYS } from "@/lib/rbac";
import type { PermissionLevel } from "@/generated/prisma";

export async function seedPresetRoles() {
  const user = await requireAdmin();
  const bId = user.battalionId!;

  const existing = await prisma.systemRole.findMany({
    where: { battalionId: bId, isPreset: true },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((r) => r.name));

  let created = 0;
  let synced = 0;
  for (const preset of PRESET_ROLES) {
    if (existingNames.has(preset.name)) {
      const role = await prisma.systemRole.findFirst({
        where: { battalionId: bId, name: preset.name, isPreset: true },
        include: { permissions: true },
      });
      if (role) {
        const existingScreens = new Set(role.permissions.map((p) => p.screen));
        const missing = preset.permissions.filter((p) => !existingScreens.has(p.screen));
        if (missing.length > 0) {
          await prisma.screenPermission.createMany({
            data: missing.map((p) => ({ roleId: role.id, screen: p.screen, level: p.level })),
          });
          synced += missing.length;
        }
      }
      continue;
    }
    await prisma.systemRole.create({
      data: {
        battalionId: bId,
        name: preset.name,
        isPreset: true,
        isAdmin: preset.isAdmin,
        isCommander: preset.isCommander,
        sortOrder: preset.sortOrder,
        permissions: {
          create: preset.permissions.map((p) => ({ screen: p.screen, level: p.level })),
        },
      },
    });
    created++;
  }

  if (created > 0 || synced > 0) {
    await audit(user.id, "CREATE", "SystemRole", "seed-presets", { created, synced });
  }
  revalidatePath("/roles");
}

export async function resetPresetRoles() {
  const user = await requireAdmin();
  const bId = user.battalionId!;

  const oldPresets = await prisma.systemRole.findMany({
    where: { battalionId: bId, isPreset: true },
    include: { _count: { select: { users: true } } },
  });

  for (const old of oldPresets) {
    if (old._count.users > 0) {
      const suffix = `_old_${Date.now()}`;
      await prisma.systemRole.update({ where: { id: old.id }, data: { name: old.name + suffix, active: false, isPreset: false } });
    } else {
      await prisma.screenPermission.deleteMany({ where: { roleId: old.id } });
      await prisma.systemRole.delete({ where: { id: old.id } });
    }
  }

  for (const preset of PRESET_ROLES) {
    await prisma.systemRole.create({
      data: {
        battalionId: bId,
        name: preset.name,
        isPreset: true,
        isAdmin: preset.isAdmin,
        isCommander: preset.isCommander,
        sortOrder: preset.sortOrder,
        permissions: {
          create: preset.permissions.map((p) => ({ screen: p.screen, level: p.level })),
        },
      },
    });
  }

  await audit(user.id, "UPDATE", "SystemRole", "reset-presets", { count: PRESET_ROLES.length });
  revalidatePath("/roles");
}

export async function saveSystemRole(formData: FormData) {
  const user = await requireAdmin();
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const isCommander = formData.get("isCommander") === "true";
  if (!name) return;

  const permissions: { screen: string; level: PermissionLevel }[] = [];
  for (const screen of SCREEN_KEYS) {
    const val = String(formData.get(`perm_${screen}`) || "");
    if (val === "VIEW" || val === "EDIT") {
      permissions.push({ screen, level: val });
    }
  }

  if (id) {
    const role = await prisma.systemRole.findUnique({ where: { id } });
    if (!role || role.battalionId !== bId) return;
    await prisma.screenPermission.deleteMany({ where: { roleId: id } });
    await prisma.systemRole.update({
      where: { id },
      data: {
        name,
        isCommander,
        permissions: { create: permissions },
      },
    });
  } else {
    await prisma.systemRole.create({
      data: {
        battalionId: bId,
        name,
        isCommander,
        permissions: { create: permissions },
      },
    });
  }

  await audit(user.id, id ? "UPDATE" : "CREATE", "SystemRole", id || name, { permissions: permissions.length });
  revalidatePath("/roles");
}

export async function deleteSystemRole(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("id") || "");

  const role = await prisma.systemRole.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });
  if (!role || role.battalionId !== user.battalionId) return;

  if (role._count.users > 0) {
    await prisma.systemRole.update({ where: { id }, data: { active: false } });
  } else {
    await prisma.screenPermission.deleteMany({ where: { roleId: id } });
    await prisma.systemRole.delete({ where: { id } });
  }

  await audit(user.id, "DELETE", "SystemRole", id);
  revalidatePath("/roles");
}

// Legacy — kept for backward compat with CustomRole
export async function saveRole(formData: FormData) {
  const user = await requireAdmin();
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  if (id) {
    // 🔒 בעלות גדוד — מניעת שינוי-שם של תפקיד בגדוד אחר
    const role = await prisma.customRole.findUnique({ where: { id }, select: { battalionId: true } });
    if (!role || role.battalionId !== bId) return;
    await prisma.customRole.update({ where: { id }, data: { name } });
  } else {
    await prisma.customRole.create({ data: { battalionId: bId, name, template: "VIEWER" } });
  }
  revalidatePath("/roles");
}

export async function deleteRole(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("id") || "");
  // 🔒 בעלות גדוד — מניעת מחיקה/השבתה של תפקיד בגדוד אחר
  const role = await prisma.customRole.findUnique({ where: { id }, select: { battalionId: true } });
  if (!role || role.battalionId !== user.battalionId) return;
  const inUse = await prisma.appUser.count({ where: { customRoleId: id } });
  if (inUse > 0) {
    await prisma.customRole.update({ where: { id }, data: { active: false } });
  } else {
    await prisma.customRole.delete({ where: { id } });
  }
  revalidatePath("/roles");
}
