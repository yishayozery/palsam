import { describe, it, expect } from "vitest";
import {
  normalizeSku, checksumOk, pickQuantityTriple, classifyLines, canApproveIntake, summarize,
  type RawVoucherRow, type CatalogItem,
} from "../src/lib/sap-voucher";

/**
 * נתוני האמת: 18 השורות של עמוד 1 בשובר האמיתי (כלי 30866833, יחסם 5222).
 * מועתקות מהמסמך כלשונן — כולל האפסים המובילים במק"ט.
 */
const PAGE1: RawVoucherRow[] = [
  { sku: "000170053", description: 'ערכת כ"ע לפריצה ושהייה - "בוב הבנאי"', standardQty: 0, allocatedQty: 1, gap: -1 },
  { sku: "034769036", description: "כוסית (מכלל) למקלע מוסב האמ\"ר", standardQty: 0, allocatedQty: 3, gap: -3 },
  { sku: "100070383", description: "זרקור עזר תקני למפקד", standardQty: 0, allocatedQty: 1, gap: -1 },
  { sku: "113516500", description: "מחסנית מתכת 30 כדור 16mm", standardQty: 2, allocatedQty: 283, gap: -281 },
  { sku: "121510553", description: "תוף הסתערות; משופר דגם ג'", standardQty: 2, allocatedQty: 4, gap: -2 },
  { sku: "123409370", description: "תוף הסתערות מבד-מכלל למאג", standardQty: 0, allocatedQty: 4, gap: -4 },
  { sku: "280350019", description: 'חבל מכלל,50 מ"מ,גרירת משאיות,אורך 6מ', standardQty: 1, allocatedQty: 1, gap: 0 },
  { sku: "280401269", description: 'רצועה נשיאה משופרת לנק"ל', standardQty: 2, allocatedQty: 2, gap: 0 },
  { sku: "280432776", description: "רצועת קשירה,מטען; תחמושת", standardQty: 2, allocatedQty: 3, gap: -1 },
  { sku: "280508292", description: 'כנה למקלע מא"ג', standardQty: 2, allocatedQty: 2, gap: 0 },
  { sku: "400728984", description: 'חגורת עבודה ש"כ זית רגילה', standardQty: 2, allocatedQty: 1, gap: 1 },
  { sku: "408070015", description: "תיק,ציוד; ציוד קרב אישי,זית", standardQty: 2, allocatedQty: 49, gap: -47 },
  { sku: "408132924", description: 'מעיל סערה זית מ"ק', standardQty: 0, allocatedQty: 71, gap: -71 },
  { sku: "408133920", description: 'מכנס סערה זית מ"ק', standardQty: 0, allocatedQty: 50, gap: -50 },
  { sku: "408149185", description: "משקפי מגן,פתוחים; מתקדמים", standardQty: 0, allocatedQty: 45, gap: -45 },
  { sku: "408149819", description: "משקפי מגן נגד רסיסים אבק וליזר", standardQty: 0, allocatedQty: 10, gap: -10 },
  { sku: "408149835", description: "משקפי מגן - נרתיק למשקפי מגן", standardQty: 0, allocatedQty: 10, gap: -10 },
  { sku: "408173477", description: "לוח מיגון; מלבני,רמה 3,מידה ב'", standardQty: 0, allocatedQty: 8, gap: -8 },
];

const catalog = (over: Partial<CatalogItem> & { sku: string }): CatalogItem =>
  ({ id: `it-${over.sku}`, name: `פריט ${over.sku}`, trackingMethod: "QUANTITY", ...over });

/** קטלוג מלא — כל 18 המק"טים קיימים ככמותיים (מצב כרמלי בפועל). */
const FULL_CATALOG = PAGE1.map((r) => catalog({ sku: r.sku }));

describe("normalizeSku — אפסים מובילים", () => {
  it("שומר אפסים מובילים כפי שהם", () => {
    expect(normalizeSku("000170053")).toBe("000170053");
  });

  it("מרפד מק\"ט שאיבד אפסים בקריאה", () => {
    // הכשל הקלאסי: OCR או אקסל מפילים את הריפוד
    expect(normalizeSku("170053")).toBe("000170053");
    expect(normalizeSku("34769036")).toBe("034769036");
  });

  it("מתעלם מרווחים ומקפים", () => {
    expect(normalizeSku("408 132-924")).toBe("408132924");
  });

  it("דוחה קלט שאינו ספרות או ארוך מ-9", () => {
    expect(normalizeSku("ABC")).toBeNull();
    expect(normalizeSku("4081329241")).toBeNull();
    expect(normalizeSku("")).toBeNull();
  });
});

describe("checksumOk — תקן − מלאי = פער", () => {
  it("מתקיים בכל 18 השורות של המסמך האמיתי", () => {
    const bad = PAGE1.filter((r) => !checksumOk(r));
    expect(bad).toEqual([]);
  });

  it("תופס ספרה שנקראה שגוי", () => {
    // 283 נקרא כ-288 — הפער כבר לא מסתדר
    expect(checksumOk({ standardQty: 2, allocatedQty: 288, gap: -281 })).toBe(false);
  });
});

describe("pickQuantityTriple", () => {
  it("בוחר את הסדר הטבעי כשהוא נכון", () => {
    expect(pickQuantityTriple([2, 283, -281])).toEqual({ standardQty: 2, allocatedQty: 283, gap: -281 });
  });

  it("מוצא את השלישייה גם כשמספרי התיאור מקדימים אותה", () => {
    // "מחסנית מתכת 30 כדור 16mm" → 30 ו-16 נכנסו לרשימה לפני העמודות
    expect(pickQuantityTriple([30, 16, 2, 283, -281])).toEqual({ standardQty: 2, allocatedQty: 283, gap: -281 });
  });

  it("מתעלם משלישיית האפסים הטריוויאלית", () => {
    // 0−1=−1 הוא הפתרון האמיתי; (0,0,0) קיים תמיד ואינו מעיד על כלום
    expect(pickQuantityTriple([0, 1, -1, 0])).toEqual({ standardQty: 0, allocatedQty: 1, gap: -1 });
  });

  it("מחזיר null בעמימות — לא מנחש", () => {
    // הסדר הטבעי נכשל (1−9≠4), ואז גם 9−4=5 וגם 9−5=4 מתקיימים — אין דרך להכריע
    expect(pickQuantityTriple([1, 9, 4, 5])).toBeNull();
  });

  it("מחזיר null כשאין מספיק מספרים", () => {
    expect(pickQuantityTriple([2, 283])).toBeNull();
  });
});

describe("classifyLines", () => {
  it("כל 18 השורות עוברות מול הקטלוג המלא", () => {
    const out = classifyLines(PAGE1, FULL_CATALOG);
    expect(out.every((l) => l.status === "OK")).toBe(true);
    expect(summarize(out).totalUnits).toBe(548); // סך היחידות הנקלטות בעמוד
  });

  it("מק\"ט חסר → UNKNOWN_SKU, וחוסם את שער 2", () => {
    const partial = FULL_CATALOG.filter((c) => c.sku !== "408132924");
    const out = classifyLines(PAGE1, partial);
    const line = out.find((l) => l.sku === "408132924")!;
    expect(line.status).toBe("UNKNOWN_SKU");
    expect(canApproveIntake(out).ready).toBe(false);
  });

  it("פריט סריאלי נחסם — אין מספרים סידוריים בשובר", () => {
    const withSerial = FULL_CATALOG.map((c) =>
      c.sku === "113516500" ? { ...c, trackingMethod: "SERIAL" } : c);
    const out = classifyLines(PAGE1, withSerial);
    expect(out.find((l) => l.sku === "113516500")!.status).toBe("SERIAL_BLOCKED");
    expect(canApproveIntake(out).blocking.SERIAL_BLOCKED).toBe(1);
  });

  it("checksum שבור גובר על התאמת קטלוג", () => {
    // שורה שנקראה שגוי לא נקלטת גם אם המק\"ט מוכר לחלוטין
    const broken = [{ ...PAGE1[3], allocatedQty: 288 }];
    const out = classifyLines(broken, FULL_CATALOG);
    expect(out[0].status).toBe("CHECKSUM_MISMATCH");
    expect(out[0].note).toContain("2 − 288");
  });

  it("מק\"ט מרופד בשובר מותאם למק\"ט לא מרופד בקטלוג", () => {
    // הקטלוג שמר "170053" בלי ריפוד — עדיין אותו פריט
    const out = classifyLines([PAGE1[0]], [catalog({ sku: "170053" })]);
    expect(out[0].status).toBe("OK");
    expect(out[0].itemTypeId).toBe("it-170053");
  });

  it("כמות אפס אינה חוסמת אישור", () => {
    const out = classifyLines([{ ...PAGE1[0], allocatedQty: 0, gap: 0 }], FULL_CATALOG);
    expect(out[0].status).toBe("ZERO_QTY");
    expect(canApproveIntake(out).ready).toBe(true);
  });
});

describe("canApproveIntake", () => {
  it("מונה כל סוגי החסימה בנפרד", () => {
    const partial = FULL_CATALOG.filter((c) => c.sku !== "408132924")
      .map((c) => (c.sku === "113516500" ? { ...c, trackingMethod: "SERIAL" } : c));
    const rows = [...PAGE1, { ...PAGE1[5], allocatedQty: 99 }]; // שורה עם checksum שבור
    const { ready, blocking } = canApproveIntake(classifyLines(rows, partial));
    expect(ready).toBe(false);
    expect(blocking).toEqual({ UNKNOWN_SKU: 1, SERIAL_BLOCKED: 1, CHECKSUM_MISMATCH: 1 });
  });
});
