import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * חתימת לינקים ציבוריים (weapons-sign / driver-form / transfer-doc) ב-HMAC.
 * במקום להסתמך על ה-ID הגולמי כ"סיסמה" (שניתן לניחוש/מנייה), הלינק כולל
 * `?t=<hmac>` שאי-אפשר לזייף בלי AUTH_SECRET. Stateless — ללא אחסון ב-DB.
 *
 * ⚠️ תלוי ב-AUTH_SECRET חזק בפרודקשן. אם הסוד חלש/דיפולטי — החתימה ניתנת לזיוף.
 */
const SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "insecure-fallback-secret";

export type LinkKind = "weapons-sign" | "driver-form" | "transfer-doc";

/** מייצר את הטוקן החתום עבור (kind,id). */
export function signLink(kind: LinkKind, id: string): string {
  return createHmac("sha256", SECRET).update(`${kind}:${id}`).digest("base64url").slice(0, 32);
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
