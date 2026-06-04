"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { Role } from "@/generated/prisma";

export async function saveUser(formData: FormData) {
  const admin = await requireCapability("users.manage");
  const id = String(formData.get("id") || "");
  const username = String(formData.get("username") || "").trim();
  const fullName = String(formData.get("fullName") || "").trim();
  const role = String(formData.get("role") || "VIEWER") as Role;
  const password = String(formData.get("password") || "");
  let holderId = String(formData.get("holderId") || "") || null;
  // רק תפקידים תחומיים מקבלים שיוך מחזיק
  if (role !== "WAREHOUSE_MANAGER" && role !== "COMPANY_REP") holderId = null;
  // מפמ פותח משתמשים בגדוד שלו בלבד
  const battalionId = admin.role === "SUPER_ADMIN" ? (String(formData.get("battalionId") || "") || null) : admin.battalionId;

  if (!username || !fullName) return;

  if (id) {
    const data: Record<string, unknown> = { username, fullName, role, holderId };
    if (password) data.passwordHash = await hashPassword(password);
    await prisma.appUser.update({ where: { id }, data });
  } else {
    await prisma.appUser.create({
      data: { username, fullName, role, holderId, battalionId, passwordHash: await hashPassword(password || "123456") },
    });
  }
  await audit(admin.id, id ? "UPDATE" : "CREATE", "AppUser", id || username);
  revalidatePath("/users");
}

export async function toggleUser(formData: FormData) {
  const admin = await requireCapability("users.manage");
  const id = String(formData.get("id") || "");
  if (id === admin.id) return;
  const u = await prisma.appUser.findUnique({ where: { id } });
  if (!u) return;
  await prisma.appUser.update({ where: { id }, data: { active: !u.active } });
  await audit(admin.id, "UPDATE", "AppUser", id, { active: !u.active });
  revalidatePath("/users");
}
