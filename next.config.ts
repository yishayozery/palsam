import type { NextConfig } from "next";

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
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
