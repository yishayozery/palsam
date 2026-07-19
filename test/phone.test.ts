import { describe, it, expect } from "vitest";
import { normalizePhone, phonesMatch } from "@/lib/phone";

describe("normalizePhone", () => {
  it("מנרמל פורמטים שונים לאותן 9 ספרות", () => {
    for (const p of ["054-9164421", "0549164421", "972549164421", "+972-54-916-4421", "  0549164421 "]) {
      expect(normalizePhone(p)).toBe("549164421");
    }
  });
  it("מחזיר null לריק/קצר מדי", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
  });
});

describe("phonesMatch", () => {
  it("תואם למרות פורמט שונה", () => {
    expect(phonesMatch("054-9164421", "+972549164421")).toBe(true);
  });
  it("לא תואם למספרים שונים / null", () => {
    expect(phonesMatch("0549164421", "0521111111")).toBe(false);
    expect(phonesMatch(null, "0549164421")).toBe(false);
  });
});
