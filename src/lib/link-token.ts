import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * חתימת לינקים ציבוריים (weapons-sign / driver-form / transfer-doc) ב-HMAC.
 * במקום להסתמך על ה-ID הגולמי כ"סיסמה" (שניתן לניחוש/מנייה), הלינק כולל
 * `?t=<hmac>` שאי-אפשר לזייף בלי AUTH_SECRET. Stateless — ללא אחסון ב-DB.
 *
 * ⚠️ תלוי ב-AUTH_SECRET חזק בפרודקשן. אם הסוד חלש/דיפולטי — החתימה ניתנת לזיוף.
 */
/**
 * מחזיר את הסוד לחתימת הלינקים. בפרודקשן — חובה AUTH_SECRET/NEXTAUTH_SECRET,
 * אחרת נזרקת שגיאה (מונע חתימות ניתנות-לזיוף עם סוד דיפולטי). ההערכה עצלה
 * (נקראת בזמן-בקשה, לא ב-import) כדי לא לשבור `next build`.
 */
function getSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET (or NEXTAUTH_SECRET) must be set in production for link signing");
  }
  return "insecure-fallback-secret";
}

export type LinkKind = "weapons-sign" | "driver-form" | "transfer-doc" | "fuel-sign" | "attendance-report" | "armory-inspection" | "accident-fill" | "accident-sign";

/** מייצר את הטוקן החתום עבור (kind,id). */
export function signLink(kind: LinkKind, id: string): string {
  return createHmac("sha256", getSecret()).update(`${kind}:${id}`).digest("base64url").slice(0, 32);
}

/** אימות טוקן בזמן-קבוע (מונע timing attacks). מחזיר true רק אם תואם. */
export function verifyLink(kind: LinkKind, id: string, token: string | null | undefined): boolean {
  if (!token || typeof token !== "string") return false;
  const expected = signLink(kind, id);
  if (expected.length !== token.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}

/** מחזיר את חלק ה-query לצירוף ללינק, לדוגמה `?t=abc...`. */
export function linkTokenQuery(kind: LinkKind, id: string): string {
  return `?t=${signLink(kind, id)}`;
}
