/**
 * 📄 שובר השאלה לכלי (SAP) — קריאה, אימות וסיווג שורות לקראת קליטה למלאי.
 *
 * הקובץ הזה **לא כותב כלום**. הוא ממיר שורות גולמיות (מ-OCR או משכבת טקסט של PDF)
 * לשורות טיוטה מסווגות. הכתיבה למלאי קורית רק אחרי אישור אנושי, בשני שערים:
 *    שער 1 — הקמת פריטים חסרים בקטלוג
 *    שער 2 — אישור הקליטה עצמה
 *
 * ⚠️ שתי הנחות שנשענות על מבנה הטופס, ושתיהן נאכפות כאן ולא נסמכות על אמון:
 *    1. `תקן מוקצה − מלאי מוקצה = פער` — משוואה שמתקיימת בכל שורה תקינה.
 *       היא ה-checksum היחיד שמבדיל בין ספרה שנקראה נכון לספרה שנקראה לא נכון.
 *    2. הכמות הנקלטת היא **מלאי מוקצה** — לא התקן.
 */

/** שורה כפי שחולצה מהמסמך, לפני אימות. */
export type RawVoucherRow = {
  sku: string;
  description: string;
  standardQty: number; // תקן מוקצה
  allocatedQty: number; // מלאי מוקצה — זו הכמות הנקלטת
  gap: number; // פער
  page?: number;
};

export type LineStatus =
  | "OK" // תואם פריט כמותי בקטלוג, החשבון מסתדר
  | "CHECKSUM_MISMATCH" // תקן − מלאי ≠ פער → ספרה נקראה לא נכון
  | "UNKNOWN_SKU" // מק"ט לא בקטלוג → נדרש שער 1
  | "SERIAL_BLOCKED" // הפריט סריאלי, ולשובר אין מספרים סידוריים
  | "ZERO_QTY"; // אין מה לקלוט

export type CatalogItem = {
  id: string;
  sku: string | null;
  name: string;
  trackingMethod: string; // "SERIAL" | "QUANTITY" | ...
};

export type ClassifiedLine = RawVoucherRow & {
  status: LineStatus;
  itemTypeId: string | null;
  catalogName: string | null;
  note: string | null;
};

/**
 * נרמול מק"ט מהשובר.
 *
 * ⚠️ בניגוד ל-loose() של סריקת הברקודים, כאן **אסור להוריד אפסים מובילים**.
 *    מק"טי SAP הם 9 ספרות עם ריפוד: "000170053" ו-"170053" אינם אותו פריט,
 *    והקטלוג שומר את הצורה המרופדת. הורדת אפסים כאן תיצור התאמות שגויות.
 */
export function normalizeSku(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-.]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  // מק"ט SAP הוא 9 ספרות; קצר מזה = ריפוד שאבד בקריאה, ארוך = נדבק אליו משהו
  if (cleaned.length > 9) return null;
  return cleaned.padStart(9, "0");
}

/** ה-checksum של הטופס: תקן − מלאי = פער. */
export function checksumOk(row: Pick<RawVoucherRow, "standardQty" | "allocatedQty" | "gap">): boolean {
  return row.standardQty - row.allocatedQty === row.gap;
}

/**
 * בחירת השלישייה (תקן, מלאי, פער) מתוך מספרים שחולצו משורה.
 *
 * נחוץ כי בטקסט RTL סדר העמודות עלול להתערבב, ומספרים מופיעים גם בתוך התיאור
 * ("30 כדור 16mm", "רמה 3"). לכן: מנסים קודם את הסדר הפוזיציוני, ורק אם החשבון
 * לא מסתדר מחפשים שלישייה אחרת שכן מקיימת אותו.
 *
 * מחזיר null כשיש **יותר מפתרון אחד** — עמימות שחייבת להגיע לאדם, לא לניחוש.
 */
export function pickQuantityTriple(nums: number[]): { standardQty: number; allocatedQty: number; gap: number } | null {
  if (nums.length < 3) return null;

  // ⚠️ תקן וכמות הם ספירות — לעולם לא שליליים. רק הפער יכול להיות.
  //    בלי האילוץ הזה, (2, 283, -281) ו-(2, -281, 283) שניהם "פותרים" את המשוואה
  //    והשורה נראית עמומה בלי סיבה. זה מה שהפיל את השורה של המחסניות.
  const plausible = (s: number, a: number) => s >= 0 && a >= 0;

  // 1) הסדר הטבעי בטופס — שלושת הראשונים
  const [a, b, c] = nums;
  if (plausible(a, b) && a - b === c) return { standardQty: a, allocatedQty: b, gap: c };

  // 2) חיפוש שלישייה מסודרת שמקיימת את המשוואה
  const found: { standardQty: number; allocatedQty: number; gap: number }[] = [];
  for (let i = 0; i < nums.length; i++) {
    for (let j = 0; j < nums.length; j++) {
      if (j === i) continue;
      for (let k = 0; k < nums.length; k++) {
        if (k === i || k === j) continue;
        if (plausible(nums[i], nums[j]) && nums[i] - nums[j] === nums[k]) {
          found.push({ standardQty: nums[i], allocatedQty: nums[j], gap: nums[k] });
        }
      }
    }
  }
  // דה-דופ לפי הערכים עצמם (אותה שלישייה יכולה להימצא דרך אינדקסים שונים)
  const uniq = new Map(found.map((f) => [`${f.standardQty}|${f.allocatedQty}|${f.gap}`, f]));
  // שלישיית האפסים (0,0,0) היא פתרון טריוויאלי שכמעט תמיד קיים ואינה מעידה על כלום
  const real = [...uniq.values()].filter((f) => !(f.standardQty === 0 && f.allocatedQty === 0 && f.gap === 0));
  return real.length === 1 ? real[0] : null;
}

/**
 * סיווג שורות מול הקטלוג. אינו נוגע במסד — מקבל את הקטלוג כפרמטר.
 *
 * הסדר כאן הוא סדר החומרה: קודם מה שחוסם קליטה, אחר כך מה שרק דורש תשומת לב.
 */
export function classifyLines(rows: RawVoucherRow[], catalog: CatalogItem[]): ClassifiedLine[] {
  const bySku = new Map<string, CatalogItem>();
  for (const it of catalog) {
    if (it.sku) {
      const n = normalizeSku(it.sku);
      if (n) bySku.set(n, it);
    }
  }

  return rows.map((row) => {
    const sku = normalizeSku(row.sku);
    const item = sku ? bySku.get(sku) ?? null : null;
    const base = { ...row, sku: sku ?? row.sku, itemTypeId: item?.id ?? null, catalogName: item?.name ?? null };

    if (!checksumOk(row)) {
      return { ...base, status: "CHECKSUM_MISMATCH" as const,
        note: `החשבון לא מסתדר: ${row.standardQty} − ${row.allocatedQty} ≠ ${row.gap}. ככל הנראה ספרה נקראה שגוי.` };
    }
    if (!item) {
      return { ...base, status: "UNKNOWN_SKU" as const, note: "מק\"ט לא קיים בקטלוג — נדרשת הקמת פריט." };
    }
    if (item.trackingMethod === "SERIAL") {
      return { ...base, status: "SERIAL_BLOCKED" as const,
        note: "פריט סריאלי — לשובר אין מספרים סידוריים. יש להזין אותם ידנית לפני קליטה." };
    }
    if (row.allocatedQty <= 0) {
      return { ...base, status: "ZERO_QTY" as const, note: "אין כמות לקליטה." };
    }
    return { ...base, status: "OK" as const, note: null };
  });
}

/** האם אפשר לפתוח את שער 2 (אישור קליטה). */
export function canApproveIntake(lines: ClassifiedLine[]): { ready: boolean; blocking: Record<string, number> } {
  const blocking: Record<string, number> = {};
  for (const l of lines) {
    if (l.status === "OK" || l.status === "ZERO_QTY") continue;
    blocking[l.status] = (blocking[l.status] ?? 0) + 1;
  }
  return { ready: Object.keys(blocking).length === 0, blocking };
}

/** סיכום לתצוגה בראש הטיוטה. */
export function summarize(lines: ClassifiedLine[]) {
  const byStatus: Record<string, number> = {};
  let totalUnits = 0;
  for (const l of lines) {
    byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
    if (l.status === "OK") totalUnits += l.allocatedQty;
  }
  return { lines: lines.length, byStatus, totalUnits };
}
