"use server";

import { prisma } from "@/lib/prisma";
import { verifyLink } from "@/lib/link-token";
import { getSession } from "@/lib/auth";

/** אישור/סגירת סבב — נגיש עם טוקן תקף (מהטלגרם) או כמשתמש מחובר של אותו גדוד. */
export async function submitArmoryInspection(
  id: string,
  token: string | null,
  payload: { items: { itemId: string; ok: boolean; note: string }[]; signatureData: string; signerName: string; notes: string },
): Promise<{ error?: string; ok?: boolean; overallOk?: boolean }> {
  const insp = await prisma.armoryInspection.findUnique({ where: { id }, select: { id: true, battalionId: true, status: true } });
  if (!insp) return { error: "סבב לא נמצא" };

  // הרשאה: טוקן תקף או משתמש מחובר מאותו גדוד
  let authOk = verifyLink("armory-inspection", id, token);
  if (!authOk) {
    const user = await getSession();
    authOk = !!user && user.battalionId === insp.battalionId;
  }
  if (!authOk) return { error: "אין הרשאה" };
  if (insp.status === "COMPLETED") return { error: "הסבב כבר הושלם" };
  if (!payload.signatureData) return { error: "נדרשת חתימת המפקד" };

  for (const it of payload.items) {
    await prisma.armoryInspectionItem.updateMany({ where: { id: it.itemId, inspectionId: id }, data: { ok: it.ok, note: it.note || null } });
  }
  const overallOk = payload.items.every((i) => i.ok);
  await prisma.armoryInspection.update({
    where: { id },
    data: { status: "COMPLETED", completedAt: new Date(), overallOk, signatureData: payload.signatureData, signerName: payload.signerName || null, notes: payload.notes || null },
  });
  return { ok: true, overallOk };
}
