import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** מחזיר את brigade+code של הגדוד הנוכחי — לבנייית הצעת שם משתמש בקליינט */
export async function GET() {
  const user = await getSession();
  if (!user?.battalionId) return NextResponse.json({ brigade: null, code: null });
  const b = await prisma.battalion.findUnique({
    where: { id: user.battalionId },
    select: { brigade: true, code: true },
  });
  return NextResponse.json({ brigade: b?.brigade ?? null, code: b?.code ?? null });
}
