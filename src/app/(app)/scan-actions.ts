"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { resolveHolderKinds } from "@/lib/scope";

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

/**
 * מפתח השוואה סלחני. הברקוד המודפס והמק"ט במאגר לא תמיד זהים תו-בתו:
 * מק"ט צה"לי מרופד באפסים מובילים (000170053), הסורק עשוי להחזיר אותו בלי
 * הריפוד, ולעיתים יש מקפים או רווחים בתוך הקוד. כאן מנרמלים את שניהם.
 */
function loose(v: string): string {
  const t = v.replace(/[\s\-_.\/]/g, "").toUpperCase();
  // קוד מספרי בלבד → מסירים אפסים מובילים כדי ש-170053 יתאים ל-000170053
  return /^\d+$/.test(t) ? t.replace(/^0+/, "") || "0" : t;
}

export async function resolveBarcode(raw: string): Promise<ScanHit> {
  const user = await requireUser();
  const bId = user.battalionId!;

  // 🔒 סריקה היא פעולה תפעולית — לא כל משתמש מאומת. בלי זה, חשבון צפייה
  //    יכול להזין מספרים סריאליים ולמפות מי מחזיק כל נשק בגדוד.
  const mayScan = user.isAdmin
    || can(user, "signatures") || can(user, "stock") || can(user, "counts")
    || can(user, "transfers") || can(user, "driving_licenses") || can(user, "dispatch");
  if (!mayScan) return { kind: "NOT_FOUND", code: normalize(raw) };

  // מי מחזיק את הפריט נחשף רק למי שהפריט בסקופ שלו. למשתמש מוגבל-פלוגה
  //    מוחזר הפריט עצמו, בלי לחשוף אצל מי הוא נמצא.
  const { companyHolderIds, warehouseHolderIds } = await resolveHolderKinds(user);
  const scoped = [...companyHolderIds, ...warehouseHolderIds];
  const seesAll = user.isAdmin || scoped.length === 0;
  const maySeeHolder = (holderId: string | null) =>
    seesAll || (!!holderId && scoped.includes(holderId));
  const code = normalize(raw);
  if (!code) return { kind: "NOT_FOUND", code: "" };

  const SERIAL_SELECT = {
    id: true, serialNumber: true, itemTypeId: true, statusId: true, lotQuantity: true,
    currentHolderId: true, externalHolderName: true, signedSoldierId: true,
    itemType: { select: { name: true, sku: true, unit: true } },
    status: { select: { name: true } },
    currentHolder: { select: { name: true } },
    signedSoldier: { select: { fullName: true } },
  } as const;

  // 1️⃣ סיריאלי / אצוותי — הברקוד מקודד את המספר הסריאלי עצמו
  let unit = await prisma.serialUnit.findFirst({
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
  // נפילה להשוואה סלחנית — מקפים/רווחים/אפסים מובילים בין המדבקה למאגר
  if (!unit) {
    const key = loose(code);
    const tail = code.replace(/\D/g, "").slice(-6);
    if (tail.length >= 4) {
      const candidates = await prisma.serialUnit.findMany({
        where: { battalionId: bId, serialNumber: { contains: tail } },
        select: SERIAL_SELECT,
        take: 50,
      });
      unit = candidates.find((u) => loose(u.serialNumber) === key) ?? null;
    }
  }
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
      // פרטי המחזיק רק אם הפריט בסקופ של המשתמש
      ...(maySeeHolder(unit.currentHolderId)
        ? {
            holderId: unit.currentHolderId,
            holderName: unit.currentHolder?.name ?? null,
            signedSoldierId: unit.signedSoldierId,
            signedSoldierName: unit.signedSoldier?.fullName ?? null,
            externalHolderName: unit.externalHolderName,
          }
        : { holderId: null, holderName: null, signedSoldierId: null, signedSoldierName: null, externalHolderName: null }),
    };
  }

  // 2️⃣ כללי — הברקוד הוא המק"ט. התאמה מדויקת קודם (מאונדקס), ורק אם נכשלה
  //    נופלים להשוואה סלחנית מול הקטלוג של הגדוד (כמה מאות שורות בלבד).
  let itemType = await prisma.itemType.findFirst({
    where: { battalionId: bId, sku: code, active: true },
    select: { id: true, name: true, sku: true, unit: true, trackingMethod: true },
  });
  if (!itemType) {
    const key = loose(code);
    const catalog = await prisma.itemType.findMany({
      where: { battalionId: bId, active: true, sku: { not: null } },
      select: { id: true, name: true, sku: true, unit: true, trackingMethod: true },
    });
    itemType = catalog.find((i) => loose(i.sku!) === key) ?? null;
  }
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
