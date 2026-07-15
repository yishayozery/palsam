import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

// שמור צד-שרת בלבד (המפתח מגיע מ-env לא-ציבורי). לא משתמשים בחבילת "server-only"
// כדי שגם סקריפטי CLI (backfill / set-webhook) יוכלו לייבא את המודול תחת tsx/node.
if (typeof window !== "undefined") {
  throw new Error("crypto.ts is server-only — do not import from client code");
}

/**
 * 🔐 הצפנת סודות ב-rest (AES-256-GCM).
 *
 * פורמט מאוחסן: "v1:<iv b64>:<tag b64>:<ciphertext b64>".
 * המפתח נגזר (scrypt) מ-ENCRYPTION_KEY (או AUTH_SECRET כ-fallback). בפרודקשן —
 * חובה אחד מהם, אחרת נזרקת שגיאה. פענוח של ערך שאינו בפורמט "v1:" מחזיר אותו
 * כמו-שהוא (תאימות לאחור לערכים שנשמרו בטקסט גלוי לפני ההצפנה — מיגרציה הדרגתית).
 */

const PREFIX = "v1:";
let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!raw) {
    if (process.env.NODE_ENV === "production" || process.env.VERCEL || process.env.CI) {
      throw new Error("ENCRYPTION_KEY (or AUTH_SECRET) must be set to encrypt secrets at rest");
    }
    // dev בלבד — מפתח קבוע כדי שהמערכת תרוץ מקומית
    cachedKey = scryptSync("dev-encryption-key-change-me", "palmy-salt", 32);
    return cachedKey;
  }
  // salt קבוע — הגזירה דטרמיניסטית כדי שכל אינסטנס יפענח את אותם ערכים
  cachedKey = scryptSync(raw, "palmy-secret-salt-v1", 32);
  return cachedKey;
}

/** האם הערך כבר מוצפן (בפורמט v1). */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

/** מצפין מחרוזת. אם כבר מוצפנת — מוחזרת כמו-שהיא (אידמפוטנטי). */
export function encryptSecret(plain: string): string {
  if (!plain || isEncrypted(plain)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** מפענח מחרוזת. ערך שאינו בפורמט v1 מוחזר כמו-שהוא (legacy plaintext). */
export function decryptSecret(stored: string): string {
  if (!stored || !isEncrypted(stored)) return stored;
  try {
    const [, ivB64, tagB64, ctB64] = stored.split(":");
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const ct = Buffer.from(ctB64, "base64");
    const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    // מפתח שגוי / ערך פגום — לא מחזירים ciphertext גולמי החוצה
    return "";
  }
}
