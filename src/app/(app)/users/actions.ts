"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { hashPassword } from "@/lib/auth";
import { resolveUniqueUsername } from "@/lib/usernames";
import { audit } from "@/lib/audit";
import type { Role } from "@/generated/prisma";

export async function saveUser(formData: FormData) {
  const admin = await requireCapability("users.manage");
  const id = String(formData.get("id") || "");
  const enteredUsername = String(formData.get("username") || "").trim();
  const fullName = String(formData.get("fullName") || "").trim();
  const phone = String(formData.get("phone") || "").trim() || null;
  const title = String(formData.get("title") || "").trim() || null;
  const personalNumber = String(formData.get("personalNumber") || "").replace(/\D/g, "").trim() || null;
  const battalionId = admin.role === "SUPER_ADMIN" ? (String(formData.get("battalionId") || "") || null) : admin.battalionId;
  const battalion = battalionId ? await prisma.battalion.findUnique({ where: { id: battalionId } }) : null;
  const suffix = battalion?.brigade || battalion?.code || null;

  // תפקיד: בנוי-מראש (enum) או מותאם ("custom:<id>" → פרופיל ההרשאות מהתבנית)
  const roleRaw = String(formData.get("role") || "VIEWER");
  let role: Role;
  let customRoleId: string | null = null;
  if (roleRaw.startsWith("custom:")) {
    const cr = await prisma.customRole.findUnique({ where: { id: roleRaw.slice(7) } });
    if (!cr || cr.battalionId !== battalionId) return;
    role = cr.template;
    customRoleId = cr.id;
  } else {
    role = roleRaw as Role;
  }

  // קצין מחסן יכול להיות משויך לכמה מחסנים (getAll). שאר התפקידים — מחזיק יחיד.
  let holderIds = formData.getAll("holderId").map(String).filter(Boolean);
  if (role !== "WAREHOUSE_MANAGER" && role !== "COMPANY_REP" && role !== "VIEWER") holderIds = [];
  if (role !== "WAREHOUSE_MANAGER") holderIds = holderIds.slice(0, 1); // יחיד לרס"פ/צופה
  const holderId = holderIds[0] || null;

  if (!enteredUsername || !fullName) return;

  const syncHolders = async (userId: string) => {
    await prisma.userHolder.deleteMany({ where: { userId } });
    for (const hId of holderIds) {
      await prisma.userHolder.create({ data: { userId, holderId: hId } });
    }
  };

  // קישור למ.א. — חיפוש חייל קיים לפי מספר אישי, או יצירת חייל חדש
  let soldierId: string | null = null;
  if (personalNumber && battalionId) {
    const existing = await prisma.soldier.findFirst({
      where: { battalionId, personalNumber },
      select: { id: true },
    });
    if (existing) {
      soldierId = existing.id;
    } else {
      const newSoldier = await prisma.soldier.create({
        data: { battalionId, fullName, personalNumber, enlisted: true, enlistedAt: new Date() },
      });
      soldierId = newSoldier.id;
    }
  }

  try {
    if (id) {
      const username = await resolveUniqueUsername(enteredUsername, suffix, id);
      await prisma.appUser.update({
        where: { id },
        data: { username, fullName, phone, title, role, customRoleId, holderId, ...(soldierId ? { soldierId } : {}) },
      });
      await syncHolders(id);
      await audit(admin.id, "UPDATE", "AppUser", id);
    } else {
      const username = await resolveUniqueUsername(enteredUsername, suffix);
      const inviteToken = nanoid(28);
      const randomHash = await hashPassword(nanoid(32));
      const created = await prisma.appUser.create({
        data: { username, fullName, phone, title, role, customRoleId, holderId, battalionId, passwordHash: randomHash, passwordSet: false, inviteToken, ...(soldierId ? { soldierId } : {}) },
      });
      await syncHolders(created.id);
      await audit(admin.id, "CREATE", "AppUser", username, { invited: true, personalNumber });
    }
  } catch {
    // לא מקריסים את המערכת על שגיאת יצירה
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
