"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp, RateLimitError } from "@/lib/rate-limit";

export type WeaponsEligibility = {
  enlisted: boolean; enlistedAt: string | null; enlistedByName: string | null;
  weaponsApproved: boolean; weaponsApprovedAt: string | null; weaponsApprovedByName: string | null;
  armoryTestSubmitted: boolean; armoryTestSubmittedAt: string | null;
  weaponsAgreementSigned: boolean; weaponsAgreementSignedAt: string | null;
  armoryTestUrl: string | null;
};

export type SoldierEquipmentResult =
  | { ok: true;
      soldierId: string;
      soldier: { fullName: string; personalNumber: string | null; companyName: string | null; battalionName: string };
      serials: { itemName: string; sku: string | null; serial: string; lotQuantity: number | null; statusName: string; isWear: boolean; isLoss: boolean; signedAt: string | null; signedBy: string | null }[];
      qty: { itemName: string; sku: string | null; unit: string; statusName: string; quantity: number; lastSignedAt: string | null; lastSignedBy: string | null }[];
      weaponsEligibility: WeaponsEligibility; }
  | { ok: false; error: string };

/** 🔫 חתימה על נוהל שמירת נשק ע"י החייל (דגל #4). */
export async function signWeaponsAgreement(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const ip = await getClientIp();
    await checkRateLimit("weapons-agreement", ip, { max: 5, windowSec: 600 });

    const soldierId = String(formData.get("soldierId") || "");
    const personalNumber = String(formData.get("personalNumber") || "").replace(/\D/g, "");
    const signatureData = String(formData.get("signatureData") || "");
    if (!soldierId || !personalNumber) return { error: "פרמטרים חסרים" };
    if (!signatureData.startsWith("data:image/")) return { error: "חתימה חסרה — נא לחתום בתיבה" };

    const s = await prisma.soldier.findUnique({
      where: { id: soldierId },
      select: { personalNumber: true, fullName: true, battalionId: true, weaponsAgreementSignedAt: true },
    });
    if (!s) return { error: "חייל לא נמצא" };
    if (s.personalNumber !== personalNumber) return { error: "לא ניתן לעדכן עבור חייל אחר" };
    if (s.weaponsAgreementSignedAt) return { ok: true };

    await prisma.soldier.update({
      where: { id: soldierId },
      data: { weaponsAgreementSignedAt: new Date(), weaponsAgreementSignature: signatureData },
    });
    await prisma.auditLog.create({
      data: {
        battalionId: s.battalionId, action: "WEAPONS_AGREEMENT_SIGNED",
        entity: "Soldier", entityId: soldierId,
        details: { soldierName: s.fullName, source: "my-equipment" },
      },
    });
    revalidatePath("/my-equipment");
    revalidatePath("/armory-ineligibility");
    return { ok: true };
  } catch (e) {
    if (e instanceof RateLimitError) {
      const min = Math.ceil(e.retryAfterSec / 60);
      return { error: `🛡️ יותר מדי ניסיונות. נסה שוב בעוד ${min} דקות.` };
    }
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** צפייה בצילום מסך של מבחן ארמון שהועלה. */
export async function getArmoryTestImage(
  formData: FormData,
): Promise<{ imageData?: string; error?: string }> {
  try {
    const ip = await getClientIp();
    await checkRateLimit("armory-test-view", ip, { max: 10, windowSec: 300 });

    const soldierId = String(formData.get("soldierId") || "");
    const personalNumber = String(formData.get("personalNumber") || "").replace(/\D/g, "");
    if (!soldierId || !personalNumber) return { error: "פרמטרים חסרים" };

    const s = await prisma.soldier.findUnique({
      where: { id: soldierId },
      select: { personalNumber: true, armoryTestProofImage: true },
    });
    if (!s) return { error: "חייל לא נמצא" };
    if (s.personalNumber !== personalNumber) return { error: "לא ניתן לצפות עבור חייל אחר" };
    if (!s.armoryTestProofImage) return { error: "לא נמצאה תמונה" };
    return { imageData: s.armoryTestProofImage };
  } catch (e) {
    if (e instanceof RateLimitError) {
      const min = Math.ceil(e.retryAfterSec / 60);
      return { error: `🛡️ יותר מדי בקשות. נסה שוב בעוד ${min} דקות.` };
    }
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** העלאת צילום מסך של מבחן ע"י החייל (דגל #3). */
export async function uploadArmoryTestProof(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const ip = await getClientIp();
    await checkRateLimit("armory-test-upload", ip, { max: 5, windowSec: 600 });

    const soldierId = String(formData.get("soldierId") || "");
    const personalNumber = String(formData.get("personalNumber") || "").replace(/\D/g, "");
    const imageData = String(formData.get("imageData") || "");
    if (!soldierId || !personalNumber) return { error: "פרמטרים חסרים" };
    if (!imageData.startsWith("data:image/")) return { error: "פורמט תמונה לא תקין" };
    if (imageData.length > 2_000_000) return { error: "התמונה גדולה מדי (מקסימום 2MB)" };

    // אימות שהחייל הוא אכן זה (PN תואם)
    const s = await prisma.soldier.findUnique({
      where: { id: soldierId },
      select: { personalNumber: true, fullName: true, battalionId: true },
    });
    if (!s) return { error: "חייל לא נמצא" };
    if (s.personalNumber !== personalNumber) return { error: "לא ניתן לעדכן עבור חייל אחר" };

    await prisma.soldier.update({
      where: { id: soldierId },
      data: { armoryTestProofImage: imageData, armoryTestProofAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        battalionId: s.battalionId, action: "ARMORY_TEST_PROOF_UPLOAD",
        entity: "Soldier", entityId: soldierId,
        details: { soldierName: s.fullName },
      },
    });
    revalidatePath("/my-equipment");
    revalidatePath("/armory/ineligibility-report");
    return { ok: true };
  } catch (e) {
    if (e instanceof RateLimitError) {
      const min = Math.ceil(e.retryAfterSec / 60);
      return { error: `🛡️ יותר מדי העלאות. נסה שוב בעוד ${min} דקות.` };
    }
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/**
 * חיפוש ציבורי של ציוד חתום על חייל לפי מ.א. + שם.
 * 🛡️ Rate-limited: 10 בקשות / 5 דק' פר IP (כדי למנוע scraping).
 */
export async function lookupSoldierEquipment(formData: FormData): Promise<SoldierEquipmentResult> {
  try {
    const ip = await getClientIp();
    await checkRateLimit("my-equipment", ip, { max: 10, windowSec: 300 });

    const personalNumber = String(formData.get("personalNumber") || "").replace(/\D/g, "").trim();
    const nameRaw = String(formData.get("fullName") || "").trim();
    if (!personalNumber) return { ok: false, error: "הזן מספר אישי" };
    if (personalNumber.length < 5) return { ok: false, error: "מספר אישי קצר מדי (5+ ספרות)" };
    if (!nameRaw) return { ok: false, error: "הזן שם מלא לאימות" };

    const soldier = await prisma.soldier.findFirst({
      where: { personalNumber, active: true },
      include: { battalion: { select: { name: true } }, company: { select: { name: true } } },
    });
    if (!soldier) return { ok: false, error: "לא נמצא חייל עם מספר אישי זה" };

    // ✅ אימות שם — מתאים גם אם החייל הקליד חלק מהשם
    const normalize = (s: string) => s.replace(/[\s"׳']/g, "").toLowerCase();
    const inputName = normalize(nameRaw);
    const dbName = normalize(soldier.fullName);
    if (!dbName.includes(inputName) && !inputName.includes(dbName)) {
      return { ok: false, error: "השם אינו תואם למספר האישי" };
    }

    // === ציוד סריאלי ===
    const serialUnits = await prisma.serialUnit.findMany({
      where: { signedSoldierId: soldier.id },
      include: { itemType: { select: { name: true, sku: true } }, status: true },
      orderBy: { itemType: { name: "asc" } },
    });
    const unitIds = serialUnits.map((u) => u.id);
    const signoutLines = unitIds.length === 0 ? [] : await prisma.transferLine.findMany({
      where: { serialUnitId: { in: unitIds }, transfer: { type: "SIGNOUT", status: "COMPLETED" } },
      include: { transfer: { select: { createdAt: true, createdBy: { select: { fullName: true } } } } },
      orderBy: { transfer: { createdAt: "desc" } },
    });
    const lastSignByUnit = new Map<string, { at: Date; by: string }>();
    for (const l of signoutLines) {
      if (!l.serialUnitId || lastSignByUnit.has(l.serialUnitId)) continue;
      lastSignByUnit.set(l.serialUnitId, { at: l.transfer.createdAt, by: l.transfer.createdBy.fullName });
    }

    // === ציוד כמותי (SIGNOUT - CHECKIN) ===
    const qtyLines = await prisma.transferLine.findMany({
      where: {
        transfer: { status: "COMPLETED", type: { in: ["SIGNOUT", "CHECKIN"] }, toSoldierId: soldier.id },
        serialUnitId: null,
      },
      include: {
        itemType: { select: { name: true, sku: true, unit: true } },
        status: true,
        transfer: { select: { type: true, createdAt: true, createdBy: { select: { fullName: true } } } },
      },
      orderBy: { transfer: { createdAt: "desc" } },
    });
    type QtyAcc = { itemName: string; sku: string | null; unit: string; statusName: string; quantity: number; lastSignedAt: string | null; lastSignedBy: string | null };
    const qtyMap = new Map<string, QtyAcc>();
    for (const l of qtyLines) {
      if (!l.statusId || !l.status) continue;
      const k = `${l.itemTypeId}|${l.statusId}`;
      const sign = l.transfer.type === "SIGNOUT" ? 1 : -1;
      const cur = qtyMap.get(k);
      if (cur) cur.quantity += sign * l.quantity;
      else qtyMap.set(k, {
        itemName: l.itemType.name, sku: l.itemType.sku, unit: l.itemType.unit,
        statusName: l.status.name, quantity: sign * l.quantity,
        lastSignedAt: l.transfer.type === "SIGNOUT" ? l.transfer.createdAt.toISOString() : null,
        lastSignedBy: l.transfer.type === "SIGNOUT" ? l.transfer.createdBy.fullName : null,
      });
    }
    const qty = Array.from(qtyMap.values()).filter((q) => q.quantity > 0).sort((a, b) => a.itemName.localeCompare(b.itemName));

    // 🔫 סטטוס תהליך נשק - לתצוגה
    const enlistedByName = soldier.enlistedById
      ? (await prisma.appUser.findUnique({ where: { id: soldier.enlistedById }, select: { fullName: true } }))?.fullName ?? null
      : null;
    const weaponsApprovedByName = soldier.weaponsApprovedById
      ? (await prisma.appUser.findUnique({ where: { id: soldier.weaponsApprovedById }, select: { fullName: true } }))?.fullName ?? null
      : null;
    const battalionArmoryTestUrl = soldier.battalion
      ? (await prisma.battalion.findUnique({ where: { id: soldier.battalionId }, select: { armoryTestUrl: true } }))?.armoryTestUrl ?? null
      : null;

    return {
      ok: true,
      soldierId: soldier.id, // לאקציות נוספות
      weaponsEligibility: {
        enlisted: !!soldier.enlisted,
        enlistedAt: soldier.enlistedAt?.toISOString() ?? null,
        enlistedByName,
        weaponsApproved: !!soldier.weaponsApprovedAt,
        weaponsApprovedAt: soldier.weaponsApprovedAt?.toISOString() ?? null,
        weaponsApprovedByName,
        armoryTestSubmitted: !!soldier.armoryTestProofAt,
        armoryTestSubmittedAt: soldier.armoryTestProofAt?.toISOString() ?? null,
        weaponsAgreementSigned: !!soldier.weaponsAgreementSignedAt,
        weaponsAgreementSignedAt: soldier.weaponsAgreementSignedAt?.toISOString() ?? null,
        armoryTestUrl: battalionArmoryTestUrl,
      },
      soldier: {
        fullName: soldier.fullName,
        personalNumber: soldier.personalNumber,
        companyName: soldier.company?.name ?? null,
        battalionName: soldier.battalion?.name ?? "",
      },
      serials: serialUnits.map((u) => {
        const meta = lastSignByUnit.get(u.id);
        return {
          itemName: u.itemType.name, sku: u.itemType.sku,
          serial: u.serialNumber, lotQuantity: u.lotQuantity,
          statusName: u.status.name, isWear: u.status.isWear, isLoss: u.status.isLoss,
          signedAt: meta?.at.toISOString() ?? null,
          signedBy: meta?.by ?? null,
        };
      }),
      qty,
    };
  } catch (e) {
    if (e instanceof RateLimitError) {
      const min = Math.ceil(e.retryAfterSec / 60);
      return { ok: false, error: `🛡️ יותר מדי בדיקות. נסה שוב בעוד ${min} דקות.` };
    }
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}
