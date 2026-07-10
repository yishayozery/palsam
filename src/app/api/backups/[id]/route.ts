import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin(); // 🔒 super-admin בלבד — הגיבוי מכיל נתוני כל הגדודים
  const { id } = await params;
  const run = await prisma.backupRun.findUnique({ where: { id }, select: { data: true, createdAt: true } });
  if (!run?.data) return NextResponse.json({ error: "לא זמין" }, { status: 404 });
  const stamp = run.createdAt.toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return new NextResponse(run.data, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="palmy-backup-${stamp}.json"`,
    },
  });
}
