import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { resolveUniqueUsername, usernameTakenInBattalion } from "@/lib/usernames";

/**
 * GET ?u=<desired>&battalionId=<id>
 * בדיקת זמינות שם משתמש **בתוך הגדוד** + המלצה לחלופה אם תפוס.
 * שם משתמש ייחודי פר-גדוד — cross-gadud לא מתנגש.
 */
export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ available: false }, { status: 401 });

  const url = new URL(req.url);
  const u = (url.searchParams.get("u") || "").trim().toLowerCase().replace(/[^\w.-]/g, "");
  if (!u) return NextResponse.json({ available: false, recommended: null });

  // אדמין-על יכול לבדוק עבור גדוד ספציפי; שאר המשתמשים — הגדוד שלהם בלבד
  const battalionId =
    user.role === "SUPER_ADMIN"
      ? (url.searchParams.get("battalionId") || "").trim() || null
      : user.battalionId;

  const taken = await usernameTakenInBattalion(u, battalionId);
  if (!taken) {
    return NextResponse.json({ available: true, recommended: u, taken: false });
  }

  const recommended = await resolveUniqueUsername(u, battalionId);
  return NextResponse.json({ available: false, taken: true, recommended });
}
