import { NextResponse } from "next/server";
import { runBackup } from "@/lib/backup";

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET || "";
  if (!expected) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const auth = req.headers.get("authorization") || "";
  const provided = auth.replace(/^Bearer\s+/i, "") || url.searchParams.get("secret") || "";
  if (provided !== expected) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const res = await runBackup();
    return NextResponse.json({ ok: res.status === "OK", ...res });
  } catch {
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
