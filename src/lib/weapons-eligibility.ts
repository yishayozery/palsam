import "server-only";
import { prisma } from "@/lib/prisma";

export type WeaponsPolicy = {
  requireEnlistment: boolean;
  requireWeaponsApproval: boolean;
  requireArmoryTest: boolean;
  requireWeaponsAgreement: boolean;
};

export type EligibilityStatus = {
  enlisted: boolean;
  enlistedAt: Date | null;
  enlistedByName: string | null;

  weaponsApproved: boolean;
  weaponsApprovedAt: Date | null;
  weaponsApprovedByName: string | null;

  armoryTestSubmitted: boolean;
  armoryTestSubmittedAt: Date | null;

  weaponsAgreementSigned: boolean;
  weaponsAgreementSignedAt: Date | null;

  isFullyEligible: boolean;
  missingSteps: string[];
};

export async function getWeaponsPolicy(battalionId: string): Promise<WeaponsPolicy> {
  const b = await prisma.battalion.findUnique({
    where: { id: battalionId },
    select: {
      requireEnlistment: true,
      requireWeaponsApproval: true,
      requireArmoryTest: true,
      requireWeaponsAgreement: true,
    },
  });
  return b ?? { requireEnlistment: true, requireWeaponsApproval: true, requireArmoryTest: true, requireWeaponsAgreement: true };
}

/** מחזיר את סטטוס הזכאות לחימוש של חייל — בודק רק שלבים שהגדוד דורש. */
export async function getSoldierWeaponsEligibility(
  soldierId: string,
  policy?: WeaponsPolicy,
): Promise<EligibilityStatus | null> {
  const s = await prisma.soldier.findUnique({
    where: { id: soldierId },
    select: {
      status: true, enlistedAt: true, enlistedById: true,
      weaponsApprovedAt: true, weaponsApprovedById: true,
      armoryTestProofImage: true, armoryTestProofAt: true,
      weaponsAgreementSignedAt: true,
      battalionId: true,
    },
  });
  if (!s) return null;

  const pol = policy ?? await getWeaponsPolicy(s.battalionId);

  const userIds = [s.enlistedById, s.weaponsApprovedById].filter((x): x is string => !!x);
  const users = userIds.length > 0
    ? await prisma.appUser.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
    : [];
  const nameOf = (id: string | null) => id ? users.find((u) => u.id === id)?.fullName ?? null : null;

  const enlisted = s.status === "ENLISTED";
  const weaponsApproved = !!s.weaponsApprovedAt;
  const armoryTestSubmitted = !!s.armoryTestProofAt;
  const weaponsAgreementSigned = !!s.weaponsAgreementSignedAt;

  const missingSteps: string[] = [];
  if (pol.requireEnlistment && !enlisted) missingSteps.push("enlisted");
  if (pol.requireWeaponsApproval && !weaponsApproved) missingSteps.push("weaponsApproved");
  if (pol.requireArmoryTest && !armoryTestSubmitted) missingSteps.push("armoryTestSubmitted");
  if (pol.requireWeaponsAgreement && !weaponsAgreementSigned) missingSteps.push("weaponsAgreementSigned");

  return {
    enlisted, enlistedAt: s.enlistedAt, enlistedByName: nameOf(s.enlistedById),
    weaponsApproved, weaponsApprovedAt: s.weaponsApprovedAt, weaponsApprovedByName: nameOf(s.weaponsApprovedById),
    armoryTestSubmitted, armoryTestSubmittedAt: s.armoryTestProofAt,
    weaponsAgreementSigned, weaponsAgreementSignedAt: s.weaponsAgreementSignedAt,
    isFullyEligible: missingSteps.length === 0,
    missingSteps,
  };
}

/**
 * איפוס דגלי תהליך הנשק — רק בביטול אישור שלישות ובשחרור חייל.
 * ⚠️ לא בזיכוי ציוד (חייל שמחליף נשק שומר על האישור) ולא בסגירת שמ"פ.
 */
export async function resetSoldierWeaponsFlags(soldierId: string): Promise<void> {
  await prisma.soldier.update({
    where: { id: soldierId },
    data: {
      weaponsApprovedAt: null,
      weaponsApprovedById: null,
      armoryTestProofImage: null,
      armoryTestProofAt: null,
      weaponsAgreementSignedAt: null,
      weaponsAgreementSignature: null,
    },
  });
}

/** בדיקה אם פריטים מסוימים הם נשק (ARMORY warehouseType) */
export async function areAnyItemsArmory(itemTypeIds: string[]): Promise<boolean> {
  if (itemTypeIds.length === 0) return false;
  const count = await prisma.itemType.count({
    where: { id: { in: itemTypeIds }, category: { warehouseType: "ARMORY" } },
  });
  return count > 0;
}
