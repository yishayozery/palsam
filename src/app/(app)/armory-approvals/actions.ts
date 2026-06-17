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
    const signatureData = String(formData.get("signatureData") || "");
    if (!soldierId) return { error: "חסר מזהה חייל" };
    if (!signatureData.startsWith("data:image/")) return { error: "חתימה חסרה — נא לחתום בתיבה" };

    const s = await prisma.soldier.findUnique({
      where: { id: soldierId }, select: { battalionId: true, enlisted: true, fullName: true },
    });
    if (!s || s.battalionId !== user.battalionId) return { error: "חייל לא נמצא" };
    if (!s.enlisted) return { error: "החייל לא אושר ע\"י שלישות. אישור שלישות הוא תנאי מוקדם." };

    await prisma.soldier.update({
      where: { id: soldierId },
      data: { weaponsApprovedAt: new Date(), weaponsApprovedById: user.id, weaponsApprovalSignature: signatureData },
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

/** 🔫 אישור המוני — כל הממתינים בבת אחת. */
export async function bulkApproveForWeapons(
  formData: FormData,
): Promise<{ ok?: boolean; count?: number; error?: string }> {
  try {
    const user = await requireCapability("weapons.approve");
    const bId = user.battalionId!;
    const signatureData = String(formData.get("signatureData") || "");
    if (!signatureData.startsWith("data:image/")) return { error: "חתימה חסרה — נא לחתום בתיבה" };

    const pending = await prisma.soldier.findMany({
      where: { battalionId: bId, active: true, enlisted: true, weaponsApprovedAt: null },
      select: { id: true, fullName: true },
    });
    if (pending.length === 0) return { ok: true, count: 0 };

    await prisma.soldier.updateMany({
      where: { id: { in: pending.map((s) => s.id) } },
      data: { weaponsApprovedAt: new Date(), weaponsApprovedById: user.id, weaponsApprovalSignature: signatureData },
    });
    await audit(user.id, "BULK_APPROVE_WEAPONS", "Battalion", bId, {
      count: pending.length,
      names: pending.map((s) => s.fullName),
    });
    revalidatePath("/armory-approvals");
    revalidatePath("/armory-ineligibility");
    revalidatePath("/my-equipment");
    return { ok: true, count: pending.length };
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
