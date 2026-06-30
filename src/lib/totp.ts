import "server-only";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";

const STRATEGY = "totp" as const;
const ISSUER = "PALMY";

/** יצירת secret חדש (base32) ו-URL ל-QR code */
export async function generateTotpSetup(username: string) {
  const secret = generateSecret();
  const otpauth = generateURI({
    strategy: STRATEGY,
    secret,
    label: username,
    issuer: ISSUER,
  });
  const qrDataUrl = await QRCode.toDataURL(otpauth, { width: 240, margin: 1 });
  return { secret, otpauth, qrDataUrl };
}

/** אימות קוד 6 ספרות מול secret — סובלנות ±30 שניות לשעון לא מסונכרן */
export function verifyTotp(token: string, secret: string): boolean {
  try {
    const cleaned = token.replace(/\s/g, "");
    const res = verifySync({
      strategy: STRATEGY,
      token: cleaned,
      secret,
      epochTolerance: 30,
    });
    return res.valid === true;
  } catch {
    return false;
  }
}
