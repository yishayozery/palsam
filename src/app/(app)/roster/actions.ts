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
  const squadId = String(formData.get("squadId") || "") || null;
  const platoon = String(formData.get("platoon") || "").trim() || null;
  const enlistNow = formData.get("enlistNow") === "on";
  if (!firstName || !lastName) throw new Error("שם פרטי + שם משפחה חובה");
  if (!companyId) throw new Error("חובה לשייך לפלוגה");

  if (personalNumber) {
    const existing = await prisma.soldier.findFirst({
      where: { battalionId: bId, personalNumber },
    });
    if (existing) throw new Error(`חייל עם מ.א. ${personalNumber} כבר קיים (${existing.fullName})`);
  }

  const fullName = `${firstName} ${lastName}`;
  await prisma.soldier.create({
    data: {
      battalionId: bId, fullName, firstName, lastName,
      personalNumber: personalNumber || null,
      phone, companyId, squadId, platoon,
      status: enlistNow ? "ENLISTED" : "REGISTERED",
      enlistedAt: enlistNow ? new Date() : null,
      enlistedById: enlistNow ? user.id : null,
    },
  });

  await audit(user.id, "CREATE_SOLDIER", "Soldier", personalNumber || fullName, { companyId, status: enlistNow ? "ENLISTED" : "REGISTERED" });
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
  const squadId = String(formData.get("squadId") || "") || null;
  const platoon = String(formData.get("platoon") || "").trim() || null;
  const personalNumber = String(formData.get("personalNumber") || "").replace(/\D/g, "").trim() || null;
  const attached = formData.get("attached") === "on";
  if (!firstName || !lastName) throw new Error("שם פרטי + שם משפחה חובה");

  const s = await prisma.soldier.findUnique({ where: { id } });
  if (!s || s.battalionId !== user.battalionId) return;

  await prisma.soldier.update({
    where: { id },
    data: { firstName, lastName, fullName: `${firstName} ${lastName}`, phone, companyId, squadId, platoon, attached, personalNumber },
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
    data: { status: "ENLISTED", enlistedAt: new Date(), enlistedById: user.id },
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

  const signedCount = await prisma.serialUnit.count({ where: { signedSoldierId: id } });
  if (signedCount > 0) {
    throw new Error(`לא ניתן לבטל אישור — החייל חתום על ${signedCount} פריטי ציוד. יש לזכות את הציוד תחילה.`);
  }

  await prisma.soldier.update({
    where: { id },
    data: { status: "REGISTERED", enlistedAt: null, enlistedById: null },
  });
  await audit(user.id, "UNENLIST_SOLDIER", "Soldier", id);
  revalidatePath("/roster");
}

/** שחרור חייל */
export async function dischargeSoldier(formData: FormData) {
  const user = await requireCapability("soldiers.roster");
  const id = String(formData.get("id") || "");
  const s = await prisma.soldier.findUnique({ where: { id } });
  if (!s || s.battalionId !== user.battalionId) return;

  const signedCount = await prisma.serialUnit.count({ where: { signedSoldierId: id } });
  if (signedCount > 0) {
    throw new Error(`לא ניתן לשחרר — החייל חתום על ${signedCount} פריטי ציוד. יש לזכות את הציוד תחילה.`);
  }

  await prisma.soldier.update({ where: { id }, data: { status: "DISCHARGED", dischargedAt: new Date() } });
  await audit(user.id, "DISCHARGE_SOLDIER", "Soldier", id);
  revalidatePath("/roster");
}

/** השבתה/הפעלה */
export async function deactivateSoldier(formData: FormData) {
  const user = await requireCapability("soldiers.roster");
  const id = String(formData.get("id") || "");
  const s = await prisma.soldier.findUnique({ where: { id } });
  if (!s || s.battalionId !== user.battalionId) return;

  if (s.status !== "INACTIVE") {
    const signedCount = await prisma.serialUnit.count({ where: { signedSoldierId: id } });
    if (signedCount > 0) {
      throw new Error(`לא ניתן להשבית — החייל חתום על ${signedCount} פריטי ציוד. יש לזכות את הציוד תחילה.`);
    }
  }

  const newStatus = s.status === "INACTIVE" ? "REGISTERED" : "INACTIVE";
  await prisma.soldier.update({ where: { id }, data: { status: newStatus } });
  await audit(user.id, "TOGGLE_SOLDIER", "Soldier", id, { status: newStatus });
  revalidatePath("/roster");
}

/** עדכון סטטוס מסופח */
export async function toggleAttached(formData: FormData) {
  const user = await requireCapability("soldiers.roster");
  const id = String(formData.get("id") || "");
  const s = await prisma.soldier.findUnique({ where: { id } });
  if (!s || s.battalionId !== user.battalionId) return;

  await prisma.soldier.update({ where: { id }, data: { attached: !s.attached } });
  await audit(user.id, "TOGGLE_ATTACHED", "Soldier", id, { attached: !s.attached });
  revalidatePath("/roster");
}

export async function deleteSoldier(formData: FormData) {
  const user = await requireCapability("soldiers.roster");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const s = await prisma.soldier.findUnique({
    where: { id },
    select: { id: true, fullName: true, personalNumber: true, battalionId: true,
      _count: { select: { signedSerialUnits: true, signedKitInstances: true } } },
  });
  if (!s || s.battalionId !== bId) throw new Error("חייל לא נמצא");
  if (s._count.signedSerialUnits > 0 || s._count.signedKitInstances > 0) {
    throw new Error(`לא ניתן למחוק — לחייל ${s._count.signedSerialUnits + s._count.signedKitInstances} פריטים חתומים. יש לזכות אותו קודם.`);
  }

  try {
    await prisma.soldier.delete({ where: { id } });
  } catch {
    throw new Error("לא ניתן למחוק — החייל מקושר לנתונים במערכת.");
  }
  await audit(user.id, "DELETE", "Soldier", id, { fullName: s.fullName, pn: s.personalNumber });
  revalidatePath("/roster");
}
