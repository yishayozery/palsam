import { NextRequest, NextResponse } from "next/server";
import { consumeMagicToken, buildSessionCookie } from "@/lib/auth";
import { audit } from "@/lib/audit";

/** לינק כניסה חד-פעמי מהבוט → מאמת, מכניס לסשן, ומפנה ל-/team. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // מפנים לאותו origin שממנו הגיעה הבקשה (nextUrl = ה-host החיצוני), כדי לשמור על אותו host+cookie.
  const base = req.nextUrl.origin;

  const user = await consumeMagicToken(token);
  if (!user) {
    return NextResponse.redirect(`${base}/login?magic=expired`);
  }

  const cookie = await buildSessionCookie(user);
  const res = NextResponse.redirect(`${base}/team`);
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  await audit(user.id, "MAGIC_LOGIN", "AppUser", user.id, {});
  return res;
}
