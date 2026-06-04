import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

function loginUrl(req: Request): string {
  // מאחורי proxy (Railway) req.url מצביע על המארח הפנימי — נשתמש בכתובת הציבורית/כותרות
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (base) return `${base.replace(/\/$/, "")}/login`;
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (host) return `${proto}://${host}/login`;
  return new URL("/login", req.url).toString();
}

export async function POST(req: Request) {
  await destroySession();
  return NextResponse.redirect(loginUrl(req), 303);
}

export async function GET(req: Request) {
  await destroySession();
  return NextResponse.redirect(loginUrl(req), 303);
}
