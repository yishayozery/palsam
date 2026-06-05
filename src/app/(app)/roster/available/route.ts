import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * רשימת חיילים זמינים לקישור למשתמש (לא מקושרים עדיין).
 * GET ?q=<חיפוש>&companyId=<id> → [{id, fullName, pn, companyName}]
 */
export async function GET(req: Request) {
  const user = await getSession();
  if (!user?.battalionId) return NextResponse.json([], { status: 401 });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const companyId = (url.searchParams.get("companyId") || "").trim() || null;

  const soldiers = await prisma.soldier.findMany({
    where: {
      battalionId: user.battalionId,
      active: true,
      appUser: { is: null }, // לא מקושר עדיין
      ...(companyId ? { companyId } : {}),
    },
    include: { company: { select: { name: true } } },
    orderBy: [{ lastName: "asc" }, { fullName: "asc" }],
    take: 100,
  });
  const filtered = q
    ? soldiers.filter((s) => s.fullName.toLowerCase().includes(q) || (s.personalNumber ?? "").includes(q))
    : soldiers;
  return NextResponse.json(
    filtered.slice(0, 30).map((s) => ({
      id: s.id, fullName: s.fullName, pn: s.personalNumber, phone: s.phone,
      companyName: s.company?.name ?? null,
    })),
  );
}
