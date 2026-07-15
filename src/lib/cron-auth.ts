import "server-only";
import { timingSafeEqual } from "crypto";

/**
 * אימות בקשת cron. Vercel Cron שולח `Authorization: Bearer <CRON_SECRET>`.
 * אין fallback ל-query-param (חושף את הסוד ב-access logs). השוואה בזמן-קבוע.
 * מחזיר true אם מורשה.
 */
export function isAuthorizedCron(req: Request): boolean {
  const expected = process.env.CRON_SECRET || "";
  if (!expected) return false;
  const auth = req.headers.get("authorization") || "";
  const provided = auth.replace(/^Bearer\s+/i, "").trim();
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
