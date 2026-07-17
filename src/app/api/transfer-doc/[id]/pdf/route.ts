import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildTransferPdfBuffer, buildArmoryIssuePdfBuffer } from "@/lib/email-pdf";
import { loadArmoryPdfData } from "@/lib/armory-pdf-data";
import { verifyLink } from "@/lib/link-token";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // 🔒 גישה ציבורית מותרת רק עם טוקן חתום
  const tok = req.nextUrl.searchParams.get("t");
  if (!verifyLink("transfer-doc", id, tok)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  const t = await prisma.transfer.findUnique({
    where: { id },
    include: {
      battalion: true,
      fromHolder: { select: { name: true, signatureClause: true, warehouseType: true, weaponsAgreementText: true } },
      toHolder: { select: { name: true } },
      toSoldier: { select: { fullName: true, personalNumber: true, company: { select: { name: true } }, weaponsApprovedById: true, weaponsApprovedAt: true, weaponsApprovalSignature: true } },
      createdBy: { select: { fullName: true } },
      approvedBy: { select: { fullName: true } },
      lines: { include: { itemType: true, serialUnit: true, status: true } },
      signatures: {
        where: { status: "SIGNED" },
        select: {
          signatureData: true,
          signedAt: true,
          soldier: { select: { fullName: true, personalNumber: true } },
          signerUser: { select: { fullName: true, title: true } },
        },
        take: 1,
      },
    },
  });

  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });

  const docNumber = t.id.slice(-8).toUpperCase();
  const soldierName = t.toSoldier?.fullName ?? "document";

  // 🔫 ארמון — טופס 1008 (אישור ניפוק נשק אישי). מקור-אמת משותף עם צרופת המייל.
  const armoryData = await loadArmoryPdfData(id);
  const isArmory = !!armoryData;
  let buf: Buffer;
  let filenameBase: string;
  if (armoryData) {
    buf = await buildArmoryIssuePdfBuffer(armoryData);
    filenameBase = `אישור ניפוק נשק - ${soldierName}`;
  } else {
    buf = await buildTransferPdfBuffer(t as Parameters<typeof buildTransferPdfBuffer>[0]);
    filenameBase = `תעודת ציוד - ${soldierName}`;
  }

  const safeFilename = `${isArmory ? "armory-issue" : "transfer"}-${docNumber}.pdf`;
  const utf8Filename = `${filenameBase} (${docNumber}).pdf`;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(utf8Filename)}`,
    },
  });
}
