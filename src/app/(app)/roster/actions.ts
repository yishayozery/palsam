"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

/** הקמת חייל ע"י השליש (מטה גדוד). לא משויך אוטומטית — דרוש אישור גיוס בשלב נפרד. */
export async function createSoldier(formData: FormData) {
  const user = await requireCapability("soldiers.roster");
  const bId = user.battalionId!;
  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const personalNumber = String(formData.get("personalNumber") || "").trim().replace(/\D/g, "");
  const phone = String(formData.get("phone") || "").trim() || null;
  const companyId = String(formData.get("companyId") || "") || null;
  const platoon = String(formData.get("platoon") || "").trim() || null;
  const enlistNow = formData.get("enlistNow") === "on";

  if (!firstName || !lastName) throw new Error("שם פרטי + שם משפחה חובה");
  if (!personalNumber) throw new Error("מספר אישי (ספרות בלבד) חובה");

  // ייחודיות מספר אישי בגדוד
  const existing = await prisma.soldier.findFirst({
    where: { battalionId: bId, personalNumber },
  });
  if (existing) throw new Error(`חייל עם מ.א. ${personalNumber} כבר קיים (${existing.fullName})`);

  const fullName = `${firstName} ${lastName}`;
  await prisma.soldier.create({
    data: {
      battalionId: bId, fullName, firstName, lastName, personalNumber, phone,
      companyId, platoon, active: true,
      enlisted: enlistNow,
      enlistedAt: enlistNow ? new Date() : null,
      enlistedById: enlistNow ? user.id : null,
    },
  });
  await audit(user.id, "CREATE_SOLDIER", "Soldier", personalNumber, { companyId, enlisted: enlistNow });
  revalidatePath("/roster");
  revalidatePath("/soldiers");
}

export async function updateSoldier(formData: FormData) {
  const user = await requireCapability("soldiers.roster");
  const id = String(formData.get("id") || "");
  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const phone = String(formData.get("phone") || "").trim() || null;
  const companyId = String(formData.get("companyId") || "") || null;
  const platoon = String(formData.get("platoon") || "").trim() || null;
  if (!firstName || !lastName) throw new Error("שם פרטי + שם משפחה חובה");

  const s = await prisma.soldier.findUnique({ where: { id } });
  if (!s || s.battalionId !== user.battalionId) return;

  await prisma.soldier.update({
    where: { id },
    data: { firstName, lastName, fullName: `${firstName} ${lastName}`, phone, companyId, platoon },
  });
  await audit(user.id, "UPDATE_SOLDIER", "Soldier", id);
  revalidatePath("/roster");
}

/** אישור גיוס — החייל יכול עכשיו לחתום על ציוד */
export async function enlistSoldier(formData: FormData) {
  const user = await requireCapability("soldiers.roster");
  const id = String(formData.get("id") || "");
  const s = await prisma.soldier.findUnique({ where: { id } });
  if (!s || s.battalionId !== user.battalionId) return;
  await prisma.soldier.update({
    where: { id },
    data: { enlisted: true, enlistedAt: new Date(), enlistedById: user.id },
  });
  await audit(user.id, "ENLIST_SOLDIER", "Soldier", id);
  revalidatePath("/roster");
}

/** ביטול אישור — לא יוכל לחתום עד אישור מחדש */
export async function unenlistSoldier(formData: FormData) {
  const user = await requireCapability("soldiers.roster");
  const id = String(formData.get("id") || "");
  const s = await prisma.soldier.findUnique({ where: { id } });
  if (!s || s.battalionId !== user.battalionId) return;
  await prisma.soldier.update({
    where: { id },
    data: { enlisted: false, enlistedAt: null, enlistedById: null },
  });
  await audit(user.id, "UNENLIST_SOLDIER", "Soldier", id);
  revalidatePath("/roster");
}

export async function deactivateSoldier(formData: FormData) {
  const user = await requireCapability("soldiers.roster");
  const id = String(formData.get("id") || "");
  const s = await prisma.soldier.findUnique({ where: { id } });
  if (!s || s.battalionId !== user.battalionId) return;
  await prisma.soldier.update({ where: { id }, data: { active: !s.active } });
  await audit(user.id, "TOGGLE_SOLDIER", "Soldier", id, { active: !s.active });
  revalidatePath("/roster");
}
