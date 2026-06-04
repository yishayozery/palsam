"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
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
  const phone = String(formData.get("phone") || "").trim() || null;
  const role = String(formData.get("role") || "VIEWER") as Role;
  let holderId = String(formData.get("holderId") || "") || null;
  // מנהל מחסן/נציג/צופה — יכולים להיות משויכים למחזיק (צופה פלוגתי = ממוקד לפלוגה)
  if (role !== "WAREHOUSE_MANAGER" && role !== "COMPANY_REP" && role !== "VIEWER") holderId = null;
  const battalionId = admin.role === "SUPER_ADMIN" ? (String(formData.get("battalionId") || "") || null) : admin.battalionId;

  if (!username || !fullName) return;

  if (id) {
    await prisma.appUser.update({ where: { id }, data: { username, fullName, phone, role, holderId } });
    await audit(admin.id, "UPDATE", "AppUser", id);
  } else {
    // אונבורדינג: יצירה ללא סיסמה — קישור הזמנה, המשתמש יגדיר סיסמה בכניסה ראשונה
    const inviteToken = nanoid(28);
    const randomHash = await hashPassword(nanoid(32));
    await prisma.appUser.create({
      data: { username, fullName, phone, role, holderId, battalionId, passwordHash: randomHash, passwordSet: false, inviteToken },
    });
    await audit(admin.id, "CREATE", "AppUser", username, { invited: true });
  }
  revalidatePath("/users");
}

/** יצירת קישור הזמנה מחדש (איפוס סיסמה דרך הזמנה) */
export async function regenerateInvite(formData: FormData) {
  const admin = await requireCapability("users.manage");
  const id = String(formData.get("id") || "");
  const inviteToken = nanoid(28);
  await prisma.appUser.update({ where: { id }, data: { inviteToken, passwordSet: false } });
  await audit(admin.id, "REGEN_INVITE", "AppUser", id);
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
