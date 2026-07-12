"use server";

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { revalidatePath } from "next/cache";

/** שמירת תוצאת אימות OCR של צילום מבחן הארמון (מריצים בצד-לקוח, מאמתים כאן הרשאה). */
export async function saveArmoryTestVerification(
  soldierId: string, verified: boolean, ocrText: string,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await requireCapability("weapons.view");
  const soldier = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { battalionId: true } });
  if (!soldier || soldier.battalionId !== user.battalionId) return { error: "לא נמצא" };
  await prisma.soldier.update({
    where: { id: soldierId },
    data: { armoryTestVerified: verified, armoryTestOcrText: ocrText.slice(0, 2000) },
  });
  revalidatePath("/armory-ineligibility");
  return { ok: true };
}
