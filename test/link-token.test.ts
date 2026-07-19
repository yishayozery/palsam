import { describe, it, expect } from "vitest";
import { signLink, verifyLink, linkTokenQuery } from "@/lib/link-token";

describe("link-token (HMAC gating של לינקים ציבוריים)", () => {
  it("signLink דטרמיניסטי לאותם (kind,id)", () => {
    expect(signLink("accident-fill", "abc")).toBe(signLink("accident-fill", "abc"));
  });

  it("טוקן שונה ל-kind שונה או id שונה (אין דליפה חוצת-סוג)", () => {
    expect(signLink("accident-fill", "abc")).not.toBe(signLink("accident-sign", "abc"));
    expect(signLink("accident-fill", "abc")).not.toBe(signLink("accident-fill", "abd"));
  });

  it("verifyLink מאשר טוקן נכון ודוחה שגוי/ריק", () => {
    const t = signLink("transfer-doc", "x1");
    expect(verifyLink("transfer-doc", "x1", t)).toBe(true);
    expect(verifyLink("transfer-doc", "x1", "wrong")).toBe(false);
    expect(verifyLink("transfer-doc", "x1", null)).toBe(false);
    expect(verifyLink("transfer-doc", "x1", "")).toBe(false);
    expect(verifyLink("transfer-doc", "x2", t)).toBe(false); // id אחר
  });

  it("linkTokenQuery מחזיר ?t=<token> תואם", () => {
    const q = linkTokenQuery("accident-fill", "abc");
    expect(q).toBe(`?t=${signLink("accident-fill", "abc")}`);
  });
});
