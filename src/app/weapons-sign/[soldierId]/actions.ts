"use server";

import { prisma } from "@/lib/prisma";
import { verifyLink } from "@/lib/link-token";

/** חתימת נוהל שמירת נשק דרך לינק ישיר (ציבורי, מאובטח בטוקן חתום). */
export async function signWeaponsAgreement(
  soldierId: string,
  token: string,
  fullName: string,
  personalNumber: string,
  signatureData: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    // 🔒 אימות טוקן חתום — מונע חתימה על חייל אקראי
    if (!verifyLink("weapons-sign", soldierId, token)) return { error: "קישור לא תקין" };
    if (!signatureData.startsWith("data:image/")) return { error: "חתימה חסרה — נא לחתום בתיבה" };
    const s = await prisma.soldier.findUnique({
      where: { id: soldierId },
      select: { battalionId: true, fullName: true, personalNumber: true, weaponsAgreementSignedAt: true },
    });
    if (!s) return { error: "קישור לא תקין" };
    if (s.weaponsAgreementSignedAt) return { ok: true };

    const pn = personalNumber.replace(/\D/g, "");
    await prisma.soldier.update({
      where: { id: soldierId },
      data: {
        weaponsAgreementSignedAt: new Date(),
        weaponsAgreementSignature: signatureData,
        // מילוי-חסר בלבד (לא לדרוס נתונים קיימים)
        ...(!s.fullName && fullName.trim() ? { fullName: fullName.trim() } : {}),
        ...(!s.personalNumber && pn ? { personalNumber: pn } : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        battalionId: s.battalionId, action: "WEAPONS_AGREEMENT_SIGNED",
        entity: "Soldier", entityId: soldierId,
        details: { soldierName: s.fullName, source: "weapons-sign-link" },
      },
    });
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}
