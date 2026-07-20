"use server";

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { revalidatePath } from "next/cache";

/** שמירת תוצאת אימות OCR של צילום מבחן הארמון (מריצים בצד-לקוח, מאמתים כאן הרשאה). */
export async function saveArmoryTestVerification(
  soldierId: string, verified: boolean, _ocrText: string,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await requireCapability("weapons.approve");
  const soldier = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { battalionId: true } });
  if (!soldier || soldier.battalionId !== user.battalionId) return { error: "לא נמצא" };
  // 🔒 פרטיות: לא משמרים את טקסט ה-OCR הגולמי (מסמך צבאי) — שדה write-only שלא מוצג בשום מסך.
  //    שומרים רק את דגל האימות; טקסט קיים נמחק בכל אימות מחדש.
  await prisma.soldier.update({
    where: { id: soldierId },
    data: { armoryTestVerified: verified, armoryTestOcrText: null },
  });
  revalidatePath("/armory-ineligibility");
  return { ok: true };
}

/** אישור ידני של מבחן הארמון (כשה-OCR לא זיהה — הקצין ראה ואישר). */
export async function approveArmoryTestManually(soldierId: string): Promise<{ ok?: boolean; error?: string }> {
  const user = await requireCapability("weapons.approve");
  const soldier = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { battalionId: true } });
  if (!soldier || soldier.battalionId !== user.battalionId) return { error: "לא נמצא" };
  await prisma.soldier.update({ where: { id: soldierId }, data: { armoryTestVerified: true } });
  revalidatePath("/armory-ineligibility");
  return { ok: true };
}

/** מחיקת צילום מבחן הארמון — החייל יידרש להעלות מחדש (מאפס את דגל 2). */
export async function clearArmoryTestProof(soldierId: string): Promise<{ ok?: boolean; error?: string }> {
  const user = await requireCapability("weapons.approve");
  const soldier = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { battalionId: true } });
  if (!soldier || soldier.battalionId !== user.battalionId) return { error: "לא נמצא" };
  await prisma.soldier.update({
    where: { id: soldierId },
    data: { armoryTestProofImage: null, armoryTestProofAt: null, armoryTestVerified: null, armoryTestOcrText: null },
  });
  revalidatePath("/armory-ineligibility");
  return { ok: true };
}
