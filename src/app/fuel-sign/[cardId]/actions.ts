"use server";

import { prisma } from "@/lib/prisma";
import { verifyLink } from "@/lib/link-token";

/** חתימת החייל על קבלת כרטיס דלק דרך לינק ציבורי (מאובטח בטוקן חתום). */
export async function signFuelCardPublic(cardId: string, token: string, signatureData: string): Promise<{ ok?: boolean; error?: string }> {
  if (!verifyLink("fuel-sign", cardId, token)) return { error: "קישור לא תקין" };
  if (!signatureData.startsWith("data:image/")) return { error: "חתימה חסרה — נא לחתום בתיבה" };
  const card = await prisma.vehicleFuelCard.findUnique({ where: { id: cardId }, select: { signedAt: true, soldier: { select: { fullName: true } } } });
  if (!card) return { error: "כרטיס לא נמצא" };
  if (card.signedAt) return { ok: true }; // כבר נחתם
  await prisma.vehicleFuelCard.update({
    where: { id: cardId },
    data: { signatureData, signerName: card.soldier.fullName, signedAt: new Date() },
  });
  return { ok: true };
}
