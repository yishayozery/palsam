import "server-only";
import { prisma } from "@/lib/prisma";

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
  missingSteps: string[]; // לדוגמה: ["enlisted", "weaponsApproved"]
};

/** מחזיר את סטטוס הזכאות לחימוש של חייל - בודק את כל 3 הדגלים + שלישות. */
export async function getSoldierWeaponsEligibility(soldierId: string): Promise<EligibilityStatus | null> {
  const s = await prisma.soldier.findUnique({
    where: { id: soldierId },
    select: {
      status: true, enlistedAt: true, enlistedById: true,
      weaponsApprovedAt: true, weaponsApprovedById: true,
      armoryTestProofImage: true, armoryTestProofAt: true,
      weaponsAgreementSignedAt: true,
    },
  });
  if (!s) return null;

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
  if (!enlisted) missingSteps.push("enlisted");
  if (!weaponsApproved) missingSteps.push("weaponsApproved");
  if (!armoryTestSubmitted) missingSteps.push("armoryTestSubmitted");
  if (!weaponsAgreementSigned) missingSteps.push("weaponsAgreementSigned");

  return {
    enlisted, enlistedAt: s.enlistedAt, enlistedByName: nameOf(s.enlistedById),
    weaponsApproved, weaponsApprovedAt: s.weaponsApprovedAt, weaponsApprovedByName: nameOf(s.weaponsApprovedById),
    armoryTestSubmitted, armoryTestSubmittedAt: s.armoryTestProofAt,
    weaponsAgreementSigned, weaponsAgreementSignedAt: s.weaponsAgreementSignedAt,
    isFullyEligible: missingSteps.length === 0,
    missingSteps,
  };
}

/** האם חייל עדיין מחזיק נשק כלשהו אצלו? (לבדיקה אם לאפס את הדגלים אחרי CHECKIN) */
export async function soldierHasAnyWeapons(soldierId: string): Promise<boolean> {
  const cnt = await prisma.serialUnit.count({
    where: {
      signedSoldierId: soldierId,
      itemType: { category: { warehouseType: "ARMORY" } },
    },
  });
  return cnt > 0;
}

/** איפוס 3 דגלי תהליך נשק - כשחייל החזיר את הנשק האחרון שלו. */
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
