import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ available: false }, { status: 401 });
  const url = new URL(req.url);
  const u = (url.searchParams.get("u") || "").trim();
  if (!u) return NextResponse.json({ available: false });
  const exists = await prisma.appUser.findUnique({ where: { username: u } });
  return NextResponse.json({ available: !exists });
}
