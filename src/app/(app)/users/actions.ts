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
  const soldierId = String(formData.get("soldierId") || "").trim() || null;
  const battalionId = admin.role === "SUPER_ADMIN" ? (String(formData.get("battalionId") || "") || null) : admin.battalionId;

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

  const systemRoleIdRaw = String(formData.get("systemRoleId") || "").trim();
  let systemRoleId: string | null = null;
  if (systemRoleIdRaw) {
    const sr = await prisma.systemRole.findUnique({ where: { id: systemRoleIdRaw } });
    if (sr && sr.battalionId === battalionId) {
      systemRoleId = sr.id;
      if (sr.isAdmin) role = "BATTALION_ADMIN" as Role;
      else if (sr.isCommander) role = "COMPANY_REP" as Role;
      else if (!role || role === "VIEWER") role = "VIEWER" as Role;
    }
  }

  // holderId = warehouse checkboxes, companyHolderId = company dropdown
  const warehouseIds = formData.getAll("holderId").map(String).filter(Boolean);
  const companyHolderId = String(formData.get("companyHolderId") || "").trim() || null;

  // הרשאות כפולות: כל תפקיד יכול להחזיק שילוב — מחסן/מחסנים + פלוגה + מחלקות.
  // האיחוד קובע לאילו נתונים המשתמש מוסמך; ה-scope בכל מסך נגזר מסוג ה-holder.
  const holderIds: string[] = [...warehouseIds];
  if (companyHolderId) holderIds.push(companyHolderId);

  // Primary holderId — קובע את הקשר סרגל הצד (מחסן מול פלוגה).
  const holderId: string | null = role === "WAREHOUSE_MANAGER"
    ? (warehouseIds[0] || companyHolderId || null)
    : (companyHolderId || warehouseIds[0] || null);

  const squadIds = formData.getAll("squadId").map(String).filter(Boolean);
  // עדכון הדגל רק אם הטופס כלל אותו (מונע דריסה מטפסי עריכה שאין בהם את הצ׳קבוקס)
  const flagPresent = formData.has("canApproveWeaponsField");
  const canApproveWeapons = formData.get("canApproveWeapons") === "on" || formData.get("canApproveWeapons") === "true";

  if (!enteredUsername || !fullName) return;

  const syncHolders = async (userId: string) => {
    await prisma.userHolder.deleteMany({ where: { userId } });
    for (const hId of holderIds) {
      await prisma.userHolder.create({ data: { userId, holderId: hId } });
    }
  };

  const syncSquads = async (userId: string) => {
    await prisma.userSquad.deleteMany({ where: { userId } });
    for (const sId of squadIds) {
      await prisma.userSquad.create({ data: { userId, squadId: sId } });
    }
  };

  // ולידציה: אם נבחר חייל, לוודא שהוא שייך לגדוד
  if (soldierId && battalionId) {
    const soldier = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { battalionId: true } });
    if (!soldier || soldier.battalionId !== battalionId) return;
  }

  try {
    if (id) {
      // 🔒 בעלות גדוד — אסור לערוך משתמש של גדוד אחר (super-admin רשאי חוצה-גדודים)
      const existing = await prisma.appUser.findUnique({ where: { id }, select: { battalionId: true } });
      if (!existing) return;
      if (admin.role !== "SUPER_ADMIN" && existing.battalionId !== admin.battalionId) return;
      const username = await resolveUniqueUsername(enteredUsername, battalionId, id);
      await prisma.appUser.update({
        where: { id },
        data: { username, fullName, phone, title, role, customRoleId, systemRoleId, holderId, soldierId, ...(flagPresent ? { canApproveWeapons } : {}) },
      });
      await syncHolders(id);
      await syncSquads(id);
      await audit(admin.id, "UPDATE", "AppUser", id);
    } else {
      const username = await resolveUniqueUsername(enteredUsername, battalionId);
      const inviteToken = nanoid(28);
      const randomHash = await hashPassword(nanoid(32));
      const created = await prisma.appUser.create({
        data: { username, fullName, phone, title, role, customRoleId, systemRoleId, holderId, battalionId, canApproveWeapons: flagPresent ? canApproveWeapons : false, passwordHash: randomHash, passwordSet: false, inviteToken, ...(soldierId ? { soldierId } : {}) },
      });
      await syncHolders(created.id);
      await syncSquads(created.id);
      await audit(admin.id, "CREATE", "AppUser", username, { invited: true, soldierId });
    }
  } catch {
    // לא מקריסים את המערכת על שגיאת יצירה
  }
  revalidatePath("/users/all");
}

/** יצירת קישור הזמנה מחדש (איפוס סיסמה דרך הזמנה) */
export async function regenerateInvite(formData: FormData) {
  const admin = await requireCapability("users.manage");
  const id = String(formData.get("id") || "");
  // 🔒 בעלות גדוד — מניעת מינוף קישור-הזמנה להשתלטות על חשבון בגדוד אחר
  const target = await prisma.appUser.findUnique({ where: { id }, select: { battalionId: true } });
  if (!target) return;
  if (admin.role !== "SUPER_ADMIN" && target.battalionId !== admin.battalionId) return;
  const inviteToken = nanoid(28);
  await prisma.appUser.update({ where: { id }, data: { inviteToken, passwordSet: false } });
  await audit(admin.id, "REGEN_INVITE", "AppUser", id);
  revalidatePath("/users/all");
}

export async function deleteAllUsersExceptMe() {
  const admin = await requireCapability("users.manage");
  const bId = admin.battalionId!;
  const others = await prisma.appUser.findMany({
    where: { battalionId: bId, id: { not: admin.id } },
    select: { id: true },
  });
  for (const u of others) {
    await prisma.userHolder.deleteMany({ where: { userId: u.id } });
    await prisma.userSquad.deleteMany({ where: { userId: u.id } });
    try {
      await prisma.appUser.delete({ where: { id: u.id } });
    } catch {
      await prisma.appUser.update({ where: { id: u.id }, data: { active: false } });
    }
  }
  await audit(admin.id, "DELETE", "AppUser", "bulk-delete", { count: others.length });
  revalidatePath("/users/all");
}

export async function clearRateLimits(formData: FormData) {
  const admin = await requireCapability("users.manage");
  const username = String(formData.get("username") || "").trim();

  if (username) {
    const deleted = await prisma.rateLimitHit.deleteMany({
      where: { scope: "login-user", key: username.toLowerCase() },
    });
    await audit(admin.id, "CLEAR_RATE_LIMIT", "RateLimitHit", username, { count: deleted.count });
  } else {
    const deleted = await prisma.rateLimitHit.deleteMany({
      where: { scope: { in: ["login", "login-user"] } },
    });
    await audit(admin.id, "CLEAR_RATE_LIMIT", "RateLimitHit", "all", { count: deleted.count });
  }
  revalidatePath("/users/all");
}

export async function toggleUser(formData: FormData) {
  const admin = await requireCapability("users.manage");
  const id = String(formData.get("id") || "");
  if (id === admin.id) return;
  const u = await prisma.appUser.findUnique({ where: { id }, select: { active: true, battalionId: true } });
  if (!u) return;
  // 🔒 בעלות גדוד — מניעת השבתה/הפעלה של משתמש בגדוד אחר
  if (admin.role !== "SUPER_ADMIN" && u.battalionId !== admin.battalionId) return;
  await prisma.appUser.update({ where: { id }, data: { active: !u.active } });
  await audit(admin.id, "UPDATE", "AppUser", id, { active: !u.active });
  revalidatePath("/users/all");
}

export async function deleteUser(formData: FormData) {
  const admin = await requireCapability("users.manage");
  const id = String(formData.get("id") || "");
  if (!id || id === admin.id) throw new Error("לא ניתן למחוק את עצמך");
  const u = await prisma.appUser.findUnique({ where: { id }, select: { id: true, username: true, fullName: true, battalionId: true } });
  if (!u || u.battalionId !== admin.battalionId) throw new Error("משתמש לא נמצא");

  await prisma.userHolder.deleteMany({ where: { userId: id } });
  await prisma.userSquad.deleteMany({ where: { userId: id } });
  try {
    await prisma.appUser.delete({ where: { id } });
  } catch {
    await prisma.appUser.update({ where: { id }, data: { active: false } });
    throw new Error("לא ניתן למחוק — המשתמש מקושר לנתונים במערכת. הושבת במקום.");
  }
  await audit(admin.id, "DELETE", "AppUser", u.username, { fullName: u.fullName });
  revalidatePath("/users/all");
}
