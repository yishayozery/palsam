import type { Prisma } from "@/generated/prisma";

// שרת בלבד (ניגש ל-DB). guard במקום חבילת "server-only" כדי שגם סקריפטי אימות
// (tsx/node) יוכלו לייבא את ה-helper לבדיקות שלמות תחת מקביליות.
if (typeof window !== "undefined") throw new Error("inventory.ts is server-only");

/**
 * עדכון יתרת מלאי כמותי עבור (פריט × מחזיק × סטטוס).
 * delta חיובי = הוספה לשורת ה-NULL location (ברירת מחדל), שלילי = גריעה מהמצטבר.
 * בעת גריעה: גורע משורות לפי סדר (NULL → גדולות → קטנות) עד שמסיים.
 * לא יורד מתחת ל-0 (גריעה גדולה מהזמין מסתפקת במה שיש).
 *
 * מודל הנתונים: שורה לכל (item, holder, status, location). location=NULL → "ללא מיקום מוגדר".
 */
export async function adjustQuantity(
  tx: Prisma.TransactionClient,
  battalionId: string,
  itemTypeId: string,
  holderId: string,
  statusId: string,
  delta: number,
): Promise<void> {
  if (delta === 0) return;

  // 🔒 נעילת-סריאליזציה פר-מפתח-מלאי (פריט × מחזיק × סטטוס). מונע lost-update כאשר
  //    כמה מנפיקים מעדכנים במקביל את אותו מלאי (read-modify-write בענף הגריעה + create-race).
  //    advisory xact-lock משתחרר אוטומטית ב-commit/rollback; מפתחות שונים אינם חוסמים זה את זה.
  //    ⚠️ מחייב הרצה בתוך אינטראקטיב-transaction (tx) — כל הקוראים עושים זאת.
  await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`${itemTypeId}:${holderId}:${statusId}`}, 0))) _lock`;

  if (delta > 0) {
    // הוספה: מעלים את שורת ה-NULL location (יוצרים אם צריך).
    // ⚙️ increment אטומי (לא read-modify-write) — מונע lost-update בהוספות מקבילות.
    const nullRow = await tx.stockBalance.findFirst({
      where: { itemTypeId, holderId, statusId, equipmentLocationId: null },
      select: { id: true },
    });
    if (nullRow) {
      await tx.stockBalance.update({
        where: { id: nullRow.id },
        data: { quantity: { increment: delta } },
      });
    } else {
      await tx.stockBalance.create({
        data: { battalionId, itemTypeId, holderId, statusId, quantity: delta },
      });
    }
    return;
  }

  // גריעה: סורקים את כל השורות של (item, holder, status) ומורידים בסדר
  let remaining = -delta;
  const rows = await tx.stockBalance.findMany({
    where: { itemTypeId, holderId, statusId },
    orderBy: [
      // NULL מיקום ראשון (נגרע לפני מיקומים מוגדרים)
      { equipmentLocationId: { sort: "asc", nulls: "first" } },
      // אח"כ הכי גדול קודם
      { quantity: "desc" },
    ],
  });
  for (const row of rows) {
    if (remaining <= 0) break;
    const take = Math.min(row.quantity, remaining);
    const next = row.quantity - take;
    if (next === 0 && row.equipmentLocationId !== null) {
      // מיקום מוגדר ועדכן ל-0 → מחיקה לניקיון
      await tx.stockBalance.delete({ where: { id: row.id } });
    } else {
      await tx.stockBalance.update({ where: { id: row.id }, data: { quantity: next } });
    }
    remaining -= take;
  }
}

/**
 * פיצול שורת מלאי קיימת — מוציא כמות ממנה ושם אותה במיקום אחר.
 * משמש כשרס"פ רוצה להעביר 3 אלונקות מ"ללא מיקום" ל-"רכב צ-12345".
 */
export async function moveStockBetweenLocations(
  tx: Prisma.TransactionClient,
  battalionId: string,
  itemTypeId: string,
  holderId: string,
  statusId: string,
  fromLocationId: string | null,
  toLocationId: string | null,
  quantity: number,
): Promise<{ ok: boolean; error?: string }> {
  if (quantity <= 0) return { ok: false, error: "כמות חייבת להיות חיובית" };
  if (fromLocationId === toLocationId) return { ok: false, error: "המיקום זהה" };

  // הורדה מהמקור
  const fromRow = await tx.stockBalance.findFirst({
    where: { itemTypeId, holderId, statusId, equipmentLocationId: fromLocationId },
  });
  if (!fromRow || fromRow.quantity < quantity) {
    return { ok: false, error: `אין מספיק במקור (זמין: ${fromRow?.quantity ?? 0})` };
  }
  const fromNext = fromRow.quantity - quantity;
  if (fromNext === 0 && fromLocationId !== null) {
    await tx.stockBalance.delete({ where: { id: fromRow.id } });
  } else {
    await tx.stockBalance.update({ where: { id: fromRow.id }, data: { quantity: fromNext } });
  }

  // הוספה ליעד
  const toRow = await tx.stockBalance.findFirst({
    where: { itemTypeId, holderId, statusId, equipmentLocationId: toLocationId },
  });
  if (toRow) {
    await tx.stockBalance.update({ where: { id: toRow.id }, data: { quantity: toRow.quantity + quantity } });
  } else {
    await tx.stockBalance.create({
      data: { battalionId, itemTypeId, holderId, statusId, equipmentLocationId: toLocationId, quantity },
    });
  }
  return { ok: true };
}

/** ברירת מחדל לסטטוס "תקין" (או הראשון הפעיל) */
export async function defaultStatusId(
  tx: Prisma.TransactionClient,
  battalionId: string,
): Promise<string> {
  const def = await tx.itemStatus.findFirst({
    where: { battalionId, isDefault: true, active: true },
  });
  if (def) return def.id;
  const first = await tx.itemStatus.findFirst({ where: { battalionId, active: true } });
  if (!first) throw new Error("לא הוגדרו סטטוסי ציוד");
  return first.id;
}
