import { describe, it, expect } from "vitest";
import { OPT_OUT_FOOTER } from "@/lib/telegram";

/**
 * הכלל המשפטי שנבדק כאן: דיוור יזום חייב לשאת דרך יציאה, והודעה תפעולית
 * אישית לא נחסמת. הבדיקות נוגעות בחוזה הציבורי בלבד — השאילתה עצמה
 * נבדקת בשטח מול ה-DB.
 */
describe("OPT_OUT_FOOTER", () => {
  it("מכיל הוראת יציאה מפורשת", () => {
    expect(OPT_OUT_FOOTER).toContain("/stop");
  });

  it("מופרד מגוף ההודעה בשורות ריקות", () => {
    expect(OPT_OUT_FOOTER.startsWith("\n")).toBe(true);
  });

  it("קצר — לא מציף הודעה קצרה", () => {
    expect(OPT_OUT_FOOTER.length).toBeLessThan(120);
  });

  it("אינו מכיל HTML שעלול להישבר בפרסור של טלגרם", () => {
    expect(OPT_OUT_FOOTER).not.toMatch(/<[^>]+>/);
  });
});
