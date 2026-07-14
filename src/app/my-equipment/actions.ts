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
  customAgreementText: string | null;
};

export type SoldierTransferDoc = {
  id: string;
  type: string;
  date: string;
  fromHolder: string;
  itemCount: number;
  itemSummary: string;
  hasSigned: boolean;
};

export type SoldierEquipmentResult =
  | { ok: true;
      soldierId: string;
      soldier: { fullName: string; personalNumber: string | null; companyName: string | null; battalionName: string; battalionLogo: string | null };
      serials: { itemName: string; sku: string | null; serial: string; lotQuantity: number | null; statusName: string; isWear: boolean; isLoss: boolean; signedAt: string | null; signedBy: string | null }[];
      qty: { itemName: string; sku: string | null; unit: string; statusName: string; quantity: number; lastSignedAt: string | null; lastSignedBy: string | null }[];
      weaponsEligibility: WeaponsEligibility;
      documents: SoldierTransferDoc[]; }
  | { ok: false; error: string };

export type TransferDocumentResult =
  | { ok: true; doc: {
      id: string; type: string; status: string; date: string; docNumber: string;
      unitName: string; unitLogo: string | null; unitMotto: string | null;
      fromHolder: string; toName: string; reason: string | null;
      createdBy: string;
      lines: { itemName: string; serial: string | null; quantity: number; statusName: string | null }[];
      signatureClause: string | null;
      signature: { data: string; signedAt: string; signerName: string; signerPN: string | null } | null;
    } }
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

    // 🛡️ cap נוסף פר-מ"א (בלתי-תלוי IP) — חוסם brute-force ממוקד של השם למ"א נתון
    //    גם אם התוקף מסובב כתובות IP. 15 ניסיונות לשעה לכל מספר אישי.
    await checkRateLimit("my-equipment-pn", personalNumber, { max: 15, windowSec: 3600 });

    const soldier = await prisma.soldier.findFirst({
      where: { personalNumber, status: { notIn: ["DISCHARGED", "INACTIVE"] } },
      include: { battalion: { select: { name: true, logoData: true } }, company: { select: { name: true } } },
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
    const armoryHolder = await prisma.holder.findFirst({
      where: { battalionId: soldier.battalionId, warehouseType: "ARMORY", active: true },
      select: { weaponsAgreementText: true, armoryTestUrl: true },
    });
    const customAgreementText = armoryHolder?.weaponsAgreementText ?? null;

    // === תעודות חתומות ===
    const transfers = await prisma.transfer.findMany({
      where: { toSoldierId: soldier.id, status: "COMPLETED", type: { in: ["SIGNOUT", "CHECKIN"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, type: true, createdAt: true,
        fromHolder: { select: { name: true } },
        lines: { select: { itemType: { select: { name: true } }, quantity: true } },
        signatures: { where: { status: "SIGNED" }, select: { id: true }, take: 1 },
      },
      take: 50,
    });
    const documents: SoldierTransferDoc[] = transfers.map((tr) => {
      const uniqueItems = [...new Set(tr.lines.map((l) => l.itemType.name))];
      return {
        id: tr.id,
        type: tr.type === "SIGNOUT" ? "החתמה" : "זיכוי",
        date: tr.createdAt.toISOString(),
        fromHolder: tr.fromHolder?.name ?? "",
        itemCount: tr.lines.length,
        itemSummary: uniqueItems.slice(0, 3).join(", ") + (uniqueItems.length > 3 ? ` (+${uniqueItems.length - 3})` : ""),
        hasSigned: tr.signatures.length > 0,
      };
    });

    return {
      ok: true,
      soldierId: soldier.id,
      weaponsEligibility: {
        enlisted: soldier.status === "ENLISTED",
        enlistedAt: soldier.enlistedAt?.toISOString() ?? null,
        enlistedByName,
        weaponsApproved: !!soldier.weaponsApprovedAt,
        weaponsApprovedAt: soldier.weaponsApprovedAt?.toISOString() ?? null,
        weaponsApprovedByName,
        armoryTestSubmitted: !!soldier.armoryTestProofAt,
        armoryTestSubmittedAt: soldier.armoryTestProofAt?.toISOString() ?? null,
        weaponsAgreementSigned: !!soldier.weaponsAgreementSignedAt,
        weaponsAgreementSignedAt: soldier.weaponsAgreementSignedAt?.toISOString() ?? null,
        armoryTestUrl: armoryHolder?.armoryTestUrl ?? null,
        customAgreementText,
      },
      soldier: {
        fullName: soldier.fullName,
        personalNumber: soldier.personalNumber,
        companyName: soldier.company?.name ?? null,
        battalionName: soldier.battalion?.name ?? "",
        battalionLogo: soldier.battalion?.logoData ?? null,
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
      documents,
    };
  } catch (e) {
    if (e instanceof RateLimitError) {
      const min = Math.ceil(e.retryAfterSec / 60);
      return { ok: false, error: `🛡️ יותר מדי בדיקות. נסה שוב בעוד ${min} דקות.` };
    }
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** צפייה בתעודת העברה ציבורית — מאומתת ע"י soldierId + personalNumber. */
export async function getSoldierTransferDocument(
  formData: FormData,
): Promise<TransferDocumentResult> {
  try {
    const ip = await getClientIp();
    await checkRateLimit("my-equipment-doc", ip, { max: 20, windowSec: 300 });

    const soldierId = String(formData.get("soldierId") || "");
    const personalNumber = String(formData.get("personalNumber") || "").replace(/\D/g, "");
    const transferId = String(formData.get("transferId") || "");
    if (!soldierId || !personalNumber || !transferId) return { ok: false, error: "פרמטרים חסרים" };

    const soldier = await prisma.soldier.findUnique({
      where: { id: soldierId },
      select: { personalNumber: true },
    });
    if (!soldier || soldier.personalNumber !== personalNumber) {
      return { ok: false, error: "אימות נכשל" };
    }

    const t = await prisma.transfer.findUnique({
      where: { id: transferId },
      include: {
        battalion: { select: { name: true, logoData: true, motto: true } },
        fromHolder: { select: { name: true, signatureClause: true } },
        toHolder: { select: { name: true } },
        toSoldier: { select: { fullName: true } },
        createdBy: { select: { fullName: true } },
        lines: { include: { itemType: { select: { name: true } }, serialUnit: { select: { serialNumber: true } }, status: { select: { name: true } } } },
        signatures: { where: { status: "SIGNED" }, select: { signatureData: true, signedAt: true, soldier: { select: { fullName: true, personalNumber: true } }, signerUser: { select: { fullName: true } } }, take: 1 },
      },
    });
    if (!t) return { ok: false, error: "תעודה לא נמצאה" };
    if (t.toSoldierId !== soldierId) return { ok: false, error: "התעודה אינה שייכת לחייל זה" };

    const sig = t.signatures[0];
    return {
      ok: true,
      doc: {
        id: t.id,
        type: t.type === "SIGNOUT" ? "החתמת חייל" : t.type === "CHECKIN" ? "זיכוי חייל" : t.type,
        status: t.status,
        date: t.createdAt.toISOString(),
        docNumber: t.id.slice(-8).toUpperCase(),
        unitName: t.battalion?.name ?? "גדוד",
        unitLogo: t.battalion?.logoData ?? null,
        unitMotto: t.battalion?.motto ?? null,
        fromHolder: t.fromHolder?.name ?? "",
        toName: t.toSoldier?.fullName ?? t.toHolder?.name ?? "",
        reason: t.reason,
        createdBy: t.createdBy.fullName,
        lines: t.lines.map((l) => ({
          itemName: l.itemType.name,
          serial: l.serialUnit?.serialNumber ?? null,
          quantity: l.quantity,
          statusName: l.status?.name ?? null,
        })),
        signatureClause: t.fromHolder?.signatureClause ?? null,
        signature: sig ? {
          data: sig.signatureData ?? "",
          signedAt: sig.signedAt?.toISOString() ?? "",
          signerName: sig.soldier?.fullName ?? sig.signerUser?.fullName ?? "",
          signerPN: sig.soldier?.personalNumber ?? null,
        } : null,
      },
    };
  } catch (e) {
    if (e instanceof RateLimitError) {
      const min = Math.ceil(e.retryAfterSec / 60);
      return { ok: false, error: `🛡️ יותר מדי בקשות. נסה שוב בעוד ${min} דקות.` };
    }
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}
