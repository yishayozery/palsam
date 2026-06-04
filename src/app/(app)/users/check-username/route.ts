import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveUniqueUsername } from "@/lib/usernames";

/**
 * GET ?u=<desired>&companyId=<id>
 * - אם companyId מוגדר: מחזיר המלצה לשם משתמש ייחודי לפי השם, הפלוגה והחטיבה
 * - אחרת: בדיקת זמינות בלבד
 */
export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ available: false }, { status: 401 });

  const url = new URL(req.url);
  const u = (url.searchParams.get("u") || "").trim().toLowerCase().replace(/[^\w.-]/g, "");
  const companyId = (url.searchParams.get("companyId") || "").trim() || null;
  if (!u) return NextResponse.json({ available: false, recommended: null });

  const exists = await prisma.appUser.findUnique({ where: { username: u } });

  // המלצה רק כשתפוס
  if (!exists) {
    return NextResponse.json({ available: true, recommended: u, taken: false });
  }

  // בנה סיומת ייחודית לפי פלוגה+חטיבה
  let suffix = "";
  if (companyId && user.battalionId) {
    const [company, battalion] = await Promise.all([
      prisma.holder.findUnique({ where: { id: companyId }, select: { name: true } }),
      prisma.battalion.findUnique({ where: { id: user.battalionId }, select: { brigade: true, code: true } }),
    ]);
    const companySlug = (company?.name || "")
      .replace(/[^֐-׿a-zA-Z0-9]+/g, "")
      .toLowerCase()
      .slice(0, 12) || "co";
    const brigadeSlug = battalion?.brigade || battalion?.code || "";
    suffix = [companySlug, brigadeSlug].filter(Boolean).join(".");
  }

  const recommended = await resolveUniqueUsername(u, suffix || null);
  return NextResponse.json({ available: false, taken: true, recommended });
}
