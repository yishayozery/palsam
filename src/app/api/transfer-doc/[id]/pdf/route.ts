import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildTransferPdfBuffer } from "@/lib/email-pdf";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const t = await prisma.transfer.findUnique({
    where: { id },
    include: {
      battalion: true,
      fromHolder: { select: { name: true, signatureClause: true } },
      toHolder: { select: { name: true } },
      toSoldier: { select: { fullName: true, personalNumber: true } },
      createdBy: { select: { fullName: true } },
      approvedBy: { select: { fullName: true } },
      lines: { include: { itemType: true, serialUnit: true, status: true } },
      signatures: {
        where: { status: "SIGNED" },
        select: {
          signedAt: true,
          soldier: { select: { fullName: true, personalNumber: true } },
          signerUser: { select: { fullName: true, title: true } },
        },
        take: 1,
      },
    },
  });

  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });

  const buf = await buildTransferPdfBuffer(t as Parameters<typeof buildTransferPdfBuffer>[0]);
  const docNumber = t.id.slice(-8).toUpperCase();
  const soldierName = t.toSoldier?.fullName ?? "document";

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="transfer-${docNumber}-${soldierName}.pdf"`,
    },
  });
}
