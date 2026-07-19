import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret, isEncrypted } from "@/lib/crypto";

describe("crypto (AES-256-GCM secrets at rest)", () => {
  it("round-trip: מצפין ומפענח חזרה לאותו ערך", () => {
    const plain = "bot-token-123:ABCdef_secret";
    const enc = encryptSecret(plain);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("אידמפוטנטי: הצפנה כפולה לא מכפילה", () => {
    const enc = encryptSecret("x");
    expect(encryptSecret(enc)).toBe(enc); // כבר מוצפן → מוחזר כמו-שהוא
  });

  it("תאימות לאחור: פענוח ערך שאינו v1 מחזיר אותו כמו-שהוא (plaintext legacy)", () => {
    expect(decryptSecret("legacy-plaintext")).toBe("legacy-plaintext");
    expect(isEncrypted("legacy-plaintext")).toBe(false);
  });

  it("ciphertext פגום מחזיר '' (לא זולג ciphertext גולמי)", () => {
    expect(decryptSecret("v1:zzz:zzz:zzz")).toBe("");
  });

  it("IV אקראי: אותו קלט → ciphertext שונה, אך מפענח לאותו ערך", () => {
    const a = encryptSecret("same");
    const b = encryptSecret("same");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same");
    expect(decryptSecret(b)).toBe("same");
  });
});
