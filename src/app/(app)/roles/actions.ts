"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";
import type { Role } from "@/generated/prisma";

// תבניות הרשאה שהמפמ רשאי לבסס עליהן תפקיד מותאם
const ALLOWED_TEMPLATES: Role[] = ["WAREHOUSE_MANAGER", "COMPANY_REP", "VIEWER"];

export async function saveRole(formData: FormData) {
  const user = await requireCapability("users.manage");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const template = String(formData.get("template") || "VIEWER") as Role;
  if (!name || !ALLOWED_TEMPLATES.includes(template)) return;

  if (id) {
    await prisma.customRole.update({ where: { id }, data: { name, template } });
  } else {
    await prisma.customRole.create({ data: { battalionId: bId, name, template } });
  }
  await audit(user.id, id ? "UPDATE" : "CREATE", "CustomRole", id || name, { template });
  revalidatePath("/roles");
}

export async function deleteRole(formData: FormData) {
  const user = await requireCapability("users.manage");
  const id = String(formData.get("id") || "");
  const inUse = await prisma.appUser.count({ where: { customRoleId: id } });
  if (inUse > 0) {
    await prisma.customRole.update({ where: { id }, data: { active: false } });
  } else {
    await prisma.customRole.delete({ where: { id } });
  }
  await audit(user.id, "DELETE", "CustomRole", id);
  revalidatePath("/roles");
}
