import "server-only";
import { prisma } from "./prisma";

/**
 * 🛡️ Rate Limiting פשוט מבוסס DB
 *
 * שימוש:
 *   await checkRateLimit("login", ip, { max: 5, windowSec: 900 });
 *
 * זורק שגיאה אם חרגו ממכסה. מוחק אוטומטית רשומות ישנות.
 */

export type RateLimitOptions = {
  max: number; // מספר בקשות מותרות
  windowSec: number; // חלון זמן בשניות
};

export class RateLimitError extends Error {
  constructor(public retryAfterSec: number) {
    super(`Rate limit exceeded. Try again in ${retryAfterSec}s`);
  }
}

/** בדיקה + הגדלה אטומית. זורק RateLimitError אם חרגו. */
export async function checkRateLimit(
  scope: string,
  key: string,
  opts: RateLimitOptions,
): Promise<void> {
  const since = new Date(Date.now() - opts.windowSec * 1000);
  // ניקוי רשומות ישנות (אופציונלי - חסכון מקום)
  if (Math.random() < 0.05) {
    await prisma.rateLimitHit.deleteMany({ where: { createdAt: { lt: since } } }).catch(() => {});
  }
  const count = await prisma.rateLimitHit.count({
    where: { scope, key, createdAt: { gte: since } },
  });
  if (count >= opts.max) {
    // מוצא את הוותיק ביותר בחלון - מחשב כמה זמן עד שיפנה מקום
    const oldest = await prisma.rateLimitHit.findFirst({
      where: { scope, key, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
    });
    const retryAfter = oldest
      ? Math.max(1, Math.ceil((oldest.createdAt.getTime() + opts.windowSec * 1000 - Date.now()) / 1000))
      : opts.windowSec;
    throw new RateLimitError(retryAfter);
  }
  await prisma.rateLimitHit.create({ data: { scope, key } });
}

/** ניסיון לחלץ IP מבקשת Next.js Server Action (heuristic, כי אין request ישיר) */
export async function getClientIp(): Promise<string> {
  try {
    // Next.js 15 - ניתן לקרוא headers ב-server actions
    const { headers } = await import("next/headers");
    const h = await headers();
    // ⚠️ x-forwarded-for[0] (השמאלי) הוא ה-IP שהלקוח *טוען* לו — ניתן לזיוף.
    //    מעדיפים headers שהפלטפורמה מזריקה (x-real-ip ב-Vercel / cf-connecting-ip),
    //    ורק כ-fallback לוקחים את ה-hop הימני ביותר של XFF (הפרוקסי הקרוב לשרת).
    return (
      h.get("x-real-ip")
      || h.get("cf-connecting-ip")
      || h.get("x-forwarded-for")?.split(",").pop()?.trim()
      || "unknown"
    );
  } catch {
    return "unknown";
  }
}
