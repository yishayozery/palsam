import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/about", "/sign", "/invite", "/_next", "/favicon", "/api/sign", "/my-equipment", "/offline"];
const ALLOWED_COUNTRIES = new Set(["IL"]);

export function proxy(req: NextRequest) {
  // 🌍 Geo-restriction: Israel only (Vercel provides x-vercel-ip-country)
  const country = req.headers.get("x-vercel-ip-country");
  if (country && !ALLOWED_COUNTRIES.has(country)) {
    return new NextResponse("🚫 Access restricted to Israel only.\nגישה מוגבלת לישראל בלבד.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const { pathname } = req.nextUrl;

  // נתיבים ציבוריים (התחברות + דפי החתמה לחיילים)
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const hasSession = req.cookies.has("gadsam_session");
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|icons/|.*\\.(?:png|jpg|svg|ico)).*)"],
};
