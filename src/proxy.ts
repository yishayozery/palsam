import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/terms", "/about", "/sign", "/invite", "/magic", "/_next", "/favicon", "/api/sign", "/api/telegram", "/api/cron", "/api/dispatch-open", "/my-equipment", "/offline", "/verify", "/dispatch-open", "/bot/dispatch", "/transfer-doc", "/counts/share", "/driver-form", "/weapons-sign", "/fuel-sign", "/attendance-report", "/api/attendance-report", "/accident-report", "/accident-sign"];
const GEO_EXEMPT_PREFIXES = ["/api/telegram", "/api/cron"];
const ALLOWED_COUNTRIES = new Set(["IL"]);

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 🌍 Geo-restriction: Israel only (exempt webhook/cron endpoints)
  const country = req.headers.get("x-vercel-ip-country");
  if (country && !ALLOWED_COUNTRIES.has(country) && !GEO_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) {
    return new NextResponse("🚫 Access restricted to Israel only.\nגישה מוגבלת לישראל בלבד.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // נתיבים ציבוריים (התחברות + דפי החתמה לחיילים + webhooks)
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    const res = NextResponse.next();
    applySecurityHeaders(res);
    return res;
  }

  const hasSession = req.cookies.has("gadsam_session");
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  applySecurityHeaders(response);
  return response;
}

function applySecurityHeaders(res: NextResponse) {
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // מצלמה מותרת למקור עצמו (צילום רישיון/מבחן/ספירה). camera=() חסם גם את האפליקציה (מסך שחור ב-WebView).
  res.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|icons/|.*\\.(?:png|jpg|svg|ico)).*)"],
};
