"use server";

import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp, RateLimitError } from "@/lib/rate-limit";

export type SoldierEquipmentResult =
  | { ok: true; soldier: { fullName: string; personalNumber: string | null; companyName: string | null; battalionName: string };
      serials: { itemName: string; sku: string | null; serial: string; lotQuantity: number | null; statusName: string; isWear: boolean; isLoss: boolean; signedAt: string | null; signedBy: string | null }[];
      qty: { itemName: string; sku: string | null; unit: string; statusName: string; quantity: number; lastSignedAt: string | null; lastSignedBy: string | null }[]; }
  | { ok: false; error: string };

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

    return {
      ok: true,
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
