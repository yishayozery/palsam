"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

/** 🔫 מג"ד/סמג"ד מאשר חייל לחימוש (דגל #2). */
export async function approveSoldierForWeapons(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireCapability("weapons.approve");
    const soldierId = String(formData.get("soldierId") || "");
    if (!soldierId) return { error: "חסר מזהה חייל" };

    const s = await prisma.soldier.findUnique({
      where: { id: soldierId }, select: { battalionId: true, enlisted: true, fullName: true },
    });
    if (!s || s.battalionId !== user.battalionId) return { error: "חייל לא נמצא" };
    if (!s.enlisted) return { error: "החייל לא אושר ע\"י שלישות. אישור שלישות הוא תנאי מוקדם." };

    await prisma.soldier.update({
      where: { id: soldierId },
      data: { weaponsApprovedAt: new Date(), weaponsApprovedById: user.id },
    });
    await audit(user.id, "APPROVE_WEAPONS", "Soldier", soldierId, { name: s.fullName });
    revalidatePath("/armory-approvals");
    revalidatePath("/armory/ineligibility-report");
    revalidatePath("/my-equipment");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** ביטול אישור (אם בטעות אושר חייל לא נכון). */
export async function revokeSoldierWeaponsApproval(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireCapability("weapons.approve");
    const soldierId = String(formData.get("soldierId") || "");
    if (!soldierId) return { error: "חסר מזהה חייל" };

    const s = await prisma.soldier.findUnique({
      where: { id: soldierId }, select: { battalionId: true, fullName: true },
    });
    if (!s || s.battalionId !== user.battalionId) return { error: "חייל לא נמצא" };

    await prisma.soldier.update({
      where: { id: soldierId },
      data: { weaponsApprovedAt: null, weaponsApprovedById: null },
    });
    await audit(user.id, "REVOKE_WEAPONS_APPROVAL", "Soldier", soldierId, { name: s.fullName });
    revalidatePath("/armory-approvals");
    revalidatePath("/armory/ineligibility-report");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}
