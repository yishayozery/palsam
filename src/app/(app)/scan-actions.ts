"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";

/**
 * 📷 זיהוי ברקוד — נקודה אחת שמחליטה *מה* הקוד, בכל המסכים.
 *
 * הסורק לא בוחר מצב: קודם מחפשים מספר סריאלי, ואם אין — מק"ט של פריט כללי.
 * סדר החיפוש חשוב — מספר סריאלי הוא הזיהוי הספציפי יותר, ולכן קודם.
 */

export type ScanHit =
  | {
      kind: "SERIAL";
      unitId: string;
      serialNumber: string;
      itemTypeId: string;
      itemName: string;
      sku: string | null;
      unit: string;
      statusId: string;
      statusName: string;
      lotQuantity: number | null;
      /** איפה הפריט נמצא עכשיו — כדי שהמסך יוכל להזהיר "כבר חתום על X" */
      holderId: string | null;
      holderName: string | null;
      signedSoldierId: string | null;
      signedSoldierName: string | null;
      externalHolderName: string | null;
    }
  | {
      kind: "ITEM_TYPE";
      itemTypeId: string;
      itemName: string;
      sku: string | null;
      unit: string;
      trackingMethod: string;
    }
  | { kind: "NOT_FOUND"; code: string };

/** מנקה קלט מסורק חומרה: רווחים, תווי בקרה, ותווי כיווניות שנדבקים מ-RTL. */
function normalize(raw: string): string {
  return raw.replace(/[‎‏‪-‮]/g, "").trim();
}

export async function resolveBarcode(raw: string): Promise<ScanHit> {
  const user = await requireUser();
  const bId = user.battalionId!;
  const code = normalize(raw);
  if (!code) return { kind: "NOT_FOUND", code: "" };

  // 1️⃣ סיריאלי / אצוותי — הברקוד מקודד את המספר הסריאלי עצמו
  const unit = await prisma.serialUnit.findFirst({
    where: { battalionId: bId, serialNumber: code },
    select: {
      id: true, serialNumber: true, itemTypeId: true, statusId: true, lotQuantity: true,
      currentHolderId: true, externalHolderName: true, signedSoldierId: true,
      itemType: { select: { name: true, sku: true, unit: true } },
      status: { select: { name: true } },
      currentHolder: { select: { name: true } },
      signedSoldier: { select: { fullName: true } },
    },
  });
  if (unit) {
    return {
      kind: "SERIAL",
      unitId: unit.id,
      serialNumber: unit.serialNumber,
      itemTypeId: unit.itemTypeId,
      itemName: unit.itemType.name,
      sku: unit.itemType.sku,
      unit: unit.itemType.unit,
      statusId: unit.statusId,
      statusName: unit.status.name,
      lotQuantity: unit.lotQuantity,
      holderId: unit.currentHolderId,
      holderName: unit.currentHolder?.name ?? null,
      signedSoldierId: unit.signedSoldierId,
      signedSoldierName: unit.signedSoldier?.fullName ?? null,
      externalHolderName: unit.externalHolderName,
    };
  }

  // 2️⃣ כללי — הברקוד הוא המק"ט
  const itemType = await prisma.itemType.findFirst({
    where: { battalionId: bId, sku: code, active: true },
    select: { id: true, name: true, sku: true, unit: true, trackingMethod: true },
  });
  if (itemType) {
    return {
      kind: "ITEM_TYPE",
      itemTypeId: itemType.id,
      itemName: itemType.name,
      sku: itemType.sku,
      unit: itemType.unit,
      trackingMethod: itemType.trackingMethod,
    };
  }

  return { kind: "NOT_FOUND", code };
}
