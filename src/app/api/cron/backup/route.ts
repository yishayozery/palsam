import { NextResponse } from "next/server";
import { runBackup } from "@/lib/backup";
import { isAuthorizedCron } from "@/lib/cron-auth";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const res = await runBackup();
    return NextResponse.json({ ok: res.status === "OK", ...res });
  } catch {
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
