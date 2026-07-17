import { prisma } from "./prisma";
import { ARMORY_ISSUE_CLAUSES, ARMORY_ISSUE_WARNING } from "./armory-issue-text";
import type { ArmoryPdfData } from "./email-pdf";

// שרת בלבד (prisma). מקור-אמת יחיד לבניית טופס 1008 (אישור ניפוק נשק) מ-transferId —
// משותף ל-route ה-PDF (/api/transfer-doc/[id]/pdf) ולצרופת המייל (email-attachments).
// כך כל 4 מסלולי-הרינדור של התעודה נשארים מסונכרנים.
if (typeof window !== "undefined") throw new Error("armory-pdf-data.ts is server-only");

/** בונה ArmoryPdfData מ-transferId אם זו החתמת ארמון (SIGNOUT ממחסן ARMORY). אחרת null. */
export async function loadArmoryPdfData(transferId: string): Promise<ArmoryPdfData | null> {
  const t = await prisma.transfer.findUnique({
    where: { id: transferId },
    include: {
      battalion: true,
      fromHolder: { select: { name: true, signatureClause: true, warehouseType: true, weaponsAgreementText: true } },
      toHolder: { select: { name: true } },
      toSoldier: { select: { fullName: true, personalNumber: true, company: { select: { name: true } }, weaponsApprovedById: true, weaponsApprovedAt: true, weaponsApprovalSignature: true } },
      createdBy: { select: { fullName: true } },
      lines: { include: { itemType: true, serialUnit: true, status: true } },
      signatures: { where: { status: "SIGNED" }, select: { signatureData: true, signedAt: true }, take: 1 },
    },
  });
  if (!t) return null;
  const isArmory = t.fromHolder?.warehouseType === "ARMORY" && t.type !== "CHECKIN";
  if (!isArmory) return null;

  const docNumber = t.id.slice(-8).toUpperCase();
  const [employment, approver] = await Promise.all([
    prisma.employment.findFirst({ where: { battalionId: t.battalionId, active: true }, orderBy: { endDate: "desc" }, select: { endDate: true } }),
    t.toSoldier?.weaponsApprovedById
      ? prisma.appUser.findUnique({ where: { id: t.toSoldier.weaponsApprovedById }, select: { fullName: true, title: true, soldier: { select: { fullName: true, personalNumber: true } } } })
      : Promise.resolve(null),
  ]);
  const clauses = t.fromHolder?.weaponsAgreementText
    ? t.fromHolder.weaponsAgreementText.split("\n").map((x) => x.trim()).filter(Boolean)
    : [...ARMORY_ISSUE_CLAUSES];

  return {
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
    approverName: approver?.soldier?.fullName ?? approver?.fullName ?? null,
    approverPersonalNumber: approver?.soldier?.personalNumber ?? null,
    approverTitle: approver?.title ?? null,
    approvedAt: t.toSoldier?.weaponsApprovedAt ?? null,
    approverSignature: t.toSoldier?.weaponsApprovalSignature ?? null,
  };
}
