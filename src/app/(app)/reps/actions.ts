"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { hashPassword } from "@/lib/auth";
import { resolveUniqueUsername } from "@/lib/usernames";
import { audit } from "@/lib/audit";

/** קצין מחסן מזמין רס"פ חדש לפלוגה + מקשר אותו למחסן שלו (אונבורדינג בהזמנה) */
export async function inviteRep(formData: FormData): Promise<{ error?: string } | void> {
  const user = await requireCapability("reps.manage");
  const bId = user.battalionId!;
  if (!user.holderId) return;
  const companyId = String(formData.get("companyId") || "");
  let fullName = String(formData.get("fullName") || "").trim();
  const enteredUsername = String(formData.get("username") || "").trim();
  let phone: string | null = String(formData.get("phone") || "").trim() || null;
  const title = String(formData.get("title") || "").trim() || null;
  // אם נבחר חייל מהרוסטר — שאיבת השם והנייד ממנו (מקור אמת)
  // ⚠️ validateSoldierId — רק אם תקין, אחרת מתעלמים (לא קורסים)
  let validatedSoldierId: string | null = null;
  const rawSoldierId = String(formData.get("soldierId") || "").trim() || null;
  if (rawSoldierId) {
    const soldier = await prisma.soldier.findUnique({ where: { id: rawSoldierId } });
    if (soldier && soldier.battalionId === bId) {
      // ודא שלא מקושר למשתמש אחר
      const linked = await prisma.appUser.findUnique({ where: { soldierId: rawSoldierId } });
      if (linked) return { error: `החייל ${soldier.fullName} כבר מקושר למשתמש @${linked.username}` };
      validatedSoldierId = rawSoldierId;
      fullName = soldier.fullName;
      phone = soldier.phone ?? phone;
    }
  }
  if (!companyId || !fullName || !enteredUsername) return { error: "חסרים שדות חובה (פלוגה / שם / שם משתמש)" };

  // הגנה: כבר יש רס"פ פעיל לאותה פלוגה במחסן הזה?
  const existingLink = await prisma.warehouseCompany.findUnique({
    where: { warehouseId_companyId: { warehouseId: user.holderId, companyId } },
  });
  if (existingLink?.repUserId) {
    return { error: "כבר קיים נציג לפלוגה זו במחסן. הסר את הקיים לפני הוספת חדש." };
  }

  // ייחודיות שם משתמש בתוך הגדוד (per-battalion) — cross-gadud לא מתנגש
  const username = await resolveUniqueUsername(enteredUsername, bId);

  const rep = await prisma.appUser.create({
    data: {
      username, fullName, phone, title, role: "COMPANY_REP", battalionId: bId, holderId: companyId,
      ...(validatedSoldierId ? { soldierId: validatedSoldierId } : {}),
      passwordHash: await hashPassword(nanoid(32)), passwordSet: false, inviteToken: nanoid(28),
    },
  });
  // קישור הרס"פ לפלוגה מול המחסן הנוכחי
  await prisma.warehouseCompany.upsert({
    where: { warehouseId_companyId: { warehouseId: user.holderId, companyId } },
    create: { warehouseId: user.holderId, companyId, repUserId: rep.id },
    update: { repUserId: rep.id },
  });
  await audit(user.id, "INVITE_REP", "AppUser", username, { companyId });
  revalidatePath("/reps");
}

/** עדכון פרטי רס"פ קיים — שם, תואר, נייד, קישור לחייל */
export async function updateRep(formData: FormData): Promise<{ error?: string } | void> {
  const user = await requireCapability("reps.manage");
  const bId = user.battalionId!;
  const userId = String(formData.get("userId") || "");
  let fullName = String(formData.get("fullName") || "").trim();
  let phone: string | null = String(formData.get("phone") || "").trim() || null;
  const title = String(formData.get("title") || "").trim() || null;
  const unlinkSoldier = formData.get("unlinkSoldier") === "on";
  const rawSoldierId = String(formData.get("soldierId") || "").trim() || null;

  if (!userId || !fullName) return { error: "חסרים פרטים" };

  const target = await prisma.appUser.findUnique({ where: { id: userId } });
  if (!target || target.battalionId !== bId) return { error: "רס״פ לא נמצא" };

  let newSoldierId: string | null | undefined = undefined;
  if (unlinkSoldier) {
    newSoldierId = null;
  } else if (rawSoldierId) {
    const soldier = await prisma.soldier.findUnique({ where: { id: rawSoldierId } });
    if (!soldier || soldier.battalionId !== bId) return { error: "חייל לא נמצא" };
    const linked = await prisma.appUser.findUnique({ where: { soldierId: rawSoldierId } });
    if (linked && linked.id !== userId) return { error: `החייל ${soldier.fullName} כבר מקושר למשתמש @${linked.username}` };
    newSoldierId = rawSoldierId;
    fullName = soldier.fullName;
    phone = soldier.phone ?? phone;
  }

  // 🆕 רענון שם משתמש מהשם הפרטי כל עוד המשתמש לא הופעל
  let newUsername: string | undefined;
  if (!target.passwordSet && fullName) {
    const first = fullName.trim().split(/\s+/)[0] ?? "";
    const slug = first.replace(/[^A-Za-z֐-׿0-9_.-]+/g, "").slice(0, 24);
    if (slug && slug !== target.username) {
      newUsername = await resolveUniqueUsername(slug, bId, userId);
    }
  }

  await prisma.appUser.update({
    where: { id: userId },
    data: {
      fullName, title, phone,
      ...(newSoldierId !== undefined ? { soldierId: newSoldierId } : {}),
      ...(newUsername ? { username: newUsername } : {}),
    },
  });
  await audit(user.id, "UPDATE_REP", "AppUser", userId, { newUsername });
  revalidatePath("/reps");
}

export async function saveRep(formData: FormData) {
  const user = await requireCapability("reps.manage");
  if (!user.holderId) return;
  const companyId = String(formData.get("companyId") || "");
  const repUserId = String(formData.get("repUserId") || "") || null;
  if (!companyId) return;

  await prisma.warehouseCompany.upsert({
    where: { warehouseId_companyId: { warehouseId: user.holderId, companyId } },
    create: { warehouseId: user.holderId, companyId, repUserId },
    update: { repUserId },
  });
  await audit(user.id, "UPDATE", "WarehouseCompany", `${user.holderId}:${companyId}`);
  revalidatePath("/reps");
}

export async function removeRep(formData: FormData) {
  const user = await requireCapability("reps.manage");
  const id = String(formData.get("id") || "");
  const link = await prisma.warehouseCompany.findUnique({ where: { id }, select: { warehouse: { select: { battalionId: true } } } });
  if (!link || link.warehouse.battalionId !== user.battalionId) return;
  await prisma.warehouseCompany.delete({ where: { id } });
  await audit(user.id, "DELETE", "WarehouseCompany", id);
  revalidatePath("/reps");
}

/** העתקת רשימת פלוגות+נציגים ממחסן אחר */
export async function copyFromWarehouse(formData: FormData) {
  const user = await requireCapability("reps.manage");
  if (!user.holderId) return;
  const sourceWarehouseId = String(formData.get("sourceWarehouseId") || "");
  if (!sourceWarehouseId || sourceWarehouseId === user.holderId) return;

  const sourceWh = await prisma.holder.findUnique({ where: { id: sourceWarehouseId }, select: { battalionId: true } });
  if (!sourceWh || sourceWh.battalionId !== user.battalionId) return;

  const source = await prisma.warehouseCompany.findMany({ where: { warehouseId: sourceWarehouseId } });
  for (const link of source) {
    await prisma.warehouseCompany.upsert({
      where: { warehouseId_companyId: { warehouseId: user.holderId, companyId: link.companyId } },
      create: { warehouseId: user.holderId, companyId: link.companyId, repUserId: link.repUserId },
      update: { repUserId: link.repUserId },
    });
  }
  await audit(user.id, "COPY_REPS", "WarehouseCompany", user.holderId, { from: sourceWarehouseId, count: source.length });
  revalidatePath("/reps");
}
