import type { NextConfig } from "next";
import { execSync } from "child_process";

// 🏷️ זיהוי גרסה - מתעדכן אוטומטית בכל פריסה
function getBuildVersion(): string {
  // ב-Vercel: שתי ENV vars זמינות אוטומטית
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (vercelSha) return vercelSha.slice(0, 7);
  // לוקלי: ננסה לקרוא מגיט
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "dev";
  }
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
