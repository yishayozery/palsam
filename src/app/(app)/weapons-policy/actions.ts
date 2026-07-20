"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability, requireScreenEdit } from "@/lib/guard";
import { audit } from "@/lib/audit";

export type WpState = { ok?: boolean; error?: string };

export async function updateWeaponsPolicy(
  _prev: WpState,
  formData: FormData,
): Promise<WpState> {
  const user = await requireScreenEdit("settings");
  const bId = user.battalionId!;

  const requireEnlistment = formData.get("requireEnlistment") === "on";
  const requireWeaponsApproval = formData.get("requireWeaponsApproval") === "on";
  const requireArmoryTest = formData.get("requireArmoryTest") === "on";
  const requireWeaponsAgreement = formData.get("requireWeaponsAgreement") === "on";

  try {
    await prisma.battalion.update({
      where: { id: bId },
      data: { requireEnlistment, requireWeaponsApproval, requireArmoryTest, requireWeaponsAgreement },
    });
  } catch {
    return { error: "שמירה נכשלה" };
  }
  await audit(user.id, "UPDATE", "Battalion", bId);
  revalidatePath("/weapons-policy");
  return { ok: true };
}
