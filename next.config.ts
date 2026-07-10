import type { NextConfig } from "next";

// 🏷️ זיהוי גרסה - מתעדכן אוטומטית בכל פריסה.
// ⚠️ אין להשתמש ב-child_process/fs כאן! זה גורם ל-Turbopack לעקוב אחרי כל
// הפרויקט (NFT) ומנפח כל serialess function מעל מגבלת 250MB → deploy_failed.
// ב-Vercel VERCEL_GIT_COMMIT_SHA זמין אוטומטית. לוקלי אפשר להזריק דרך
// NEXT_PUBLIC_BUILD_VERSION ב-.env, אחרת "dev".
function getBuildVersion(): string {
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (vercelSha) return vercelSha.slice(0, 7);
  return process.env.NEXT_PUBLIC_BUILD_VERSION || "dev";
}

function getBuildDate(): string {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

const BUILD_VERSION = getBuildVersion();
const BUILD_DATE = getBuildDate();

const securityHeaders = [
  // 🛡️ HSTS — דורש HTTPS לכל בקשה, מונע downgrade
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // 🛡️ מונע clickjacking (iframe attacks)
  { key: "X-Frame-Options", value: "DENY" },
  // 🛡️ מונע MIME sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 🛡️ Referrer מצומצם - לא מגלה איזה דף נכנסת ממנו לאתר אחר
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 🛡️ אוסר הרשאות לדפדפן (מצלמה, מיקום, מיקרופון) כברירת מחדל
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // 🛡️ XSS legacy protection (לדפדפנים ישנים)
  { key: "X-XSS-Protection", value: "1; mode=block" },
  // 🛡️ DNS prefetch control
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // 🛡️ מניעת אינדוקס במנועי חיפוש
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  // 🛡️ CSP — הגנת XSS בעומק. Next צריך inline/eval לסקריפטים; base64 (data:) לתמונות/חתימות.
  //    ללא frame-ancestors כדי לא לשבור הטמעת בוט טלגרם (נתיבי bot/dispatch-open).
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // 🏷️ זמין לקליינט כ-process.env.NEXT_PUBLIC_BUILD_VERSION / DATE
  env: {
    NEXT_PUBLIC_BUILD_VERSION: BUILD_VERSION,
    NEXT_PUBLIC_BUILD_DATE: BUILD_DATE,
  },
  productionBrowserSourceMaps: false,
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  async headers() {
    return [
      {
        source: "/((?!bot|dispatch-open|api/dispatch-open).*)",
        headers: securityHeaders,
      },
      {
        source: "/(bot|dispatch-open|api/dispatch-open)/:path*",
        headers: securityHeaders.filter((h) => h.key !== "X-Frame-Options"),
      },
    ];
  },
};

export default nextConfig;
