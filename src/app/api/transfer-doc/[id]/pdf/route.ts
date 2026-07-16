import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildTransferPdfBuffer, buildArmoryIssuePdfBuffer, type ArmoryPdfData } from "@/lib/email-pdf";
import { verifyLink } from "@/lib/link-token";
import { ARMORY_ISSUE_CLAUSES, ARMORY_ISSUE_WARNING } from "@/lib/armory-issue-text";

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

  // 🔫 ארמון — טופס 1008 (אישור ניפוק נשק אישי), פורמט זהה ל-HTML
  const isArmory = t.fromHolder?.warehouseType === "ARMORY" && t.type !== "CHECKIN";
  let buf: Buffer;
  let filenameBase: string;
  if (isArmory) {
    const [employment, approver] = await Promise.all([
      prisma.employment.findFirst({ where: { battalionId: t.battalionId, active: true }, orderBy: { endDate: "desc" }, select: { endDate: true } }),
      t.toSoldier?.weaponsApprovedById
        ? prisma.appUser.findUnique({ where: { id: t.toSoldier.weaponsApprovedById }, select: { fullName: true, title: true } })
        : Promise.resolve(null),
    ]);
    const clauses = t.fromHolder?.weaponsAgreementText
      ? t.fromHolder.weaponsAgreementText.split("\n").map((x) => x.trim()).filter(Boolean)
      : [...ARMORY_ISSUE_CLAUSES];
    const d: ArmoryPdfData = {
      docNumber,
      battalionName: t.battalion?.name ?? "גדוד",
      logoData: t.battalion?.logoData ?? null,
      motto: t.battalion?.motto ?? null,
      soldier: t.toSoldier ? { fullName: t.toSoldier.fullName, personalNumber: t.toSoldier.personalNumber, companyName: t.toSoldier.company?.name ?? null } : null,
      recipientName: t.toSoldier?.fullName ?? t.toHolder?.name ?? "________________",
      issueDate: t.signatures[0]?.signedAt ?? t.createdAt,
      endDate: employment?.endDate ?? null,
      purpose: t.reason ?? null,
      issuerName: t.createdBy.fullName,
      issuerHolderName: t.fromHolder?.name ?? null,
      declarationClauses: clauses,
      warning: ARMORY_ISSUE_WARNING,
      lines: t.lines.map((l) => ({ name: l.itemType.name, sku: l.itemType.sku, quantity: l.quantity, serial: l.serialUnit?.serialNumber ?? null })),
      soldierSignature: t.signatures[0]?.signatureData ?? null,
      signedAt: t.signatures[0]?.signedAt ?? null,
      approverName: approver?.fullName ?? null,
      approverTitle: approver?.title ?? null,
      approvedAt: t.toSoldier?.weaponsApprovedAt ?? null,
      approverSignature: t.toSoldier?.weaponsApprovalSignature ?? null,
    };
    buf = await buildArmoryIssuePdfBuffer(d);
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
