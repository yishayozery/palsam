"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export async function saveCertificationType(formData: FormData) {
  const user = await requireUser();
  if (!canEdit(user, "certifications")) return;
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!name) return;

  if (id) {
    const existing = await prisma.certificationType.findUnique({ where: { id } });
    if (!existing || existing.battalionId !== bId) return;
    await prisma.certificationType.update({ where: { id }, data: { name } });
  } else {
    await prisma.certificationType.create({ data: { battalionId: bId, name } });
  }
  await audit(user.id, "UPSERT", "CertificationType", id || "new", { name });
  revalidatePath("/certifications");
}

export async function toggleCertificationType(formData: FormData) {
  const user = await requireUser();
  if (!canEdit(user, "certifications")) return;
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const existing = await prisma.certificationType.findUnique({ where: { id } });
  if (!existing || existing.battalionId !== bId) return;
  await prisma.certificationType.update({ where: { id }, data: { active: !existing.active } });
  await audit(user.id, "TOGGLE", "CertificationType", id);
  revalidatePath("/certifications");
}

export async function saveSoldierCertifications(formData: FormData) {
  const user = await requireUser();
  // הצמדת הסמכות לחייל = ניהול חיילים (מפ/מפמ/אדמין). לא דורש הרשאת עריכה על מסך "הסמכות".
  if (!canEdit(user, "soldiers")) return;
  const bId = user.battalionId!;

  const soldierId = String(formData.get("soldierId") || "");
  const soldier = await prisma.soldier.findUnique({ where: { id: soldierId } });
  if (!soldier || soldier.battalionId !== bId) return;

  const certTypeIds = formData.getAll("certificationTypeId").map(String);

  await prisma.$transaction(async (tx) => {
    await tx.soldierCertification.deleteMany({ where: { soldierId } });
    if (certTypeIds.length > 0) {
      await tx.soldierCertification.createMany({
        data: certTypeIds.map((certificationTypeId) => ({
          soldierId,
          certificationTypeId,
        })),
      });
    }
  });
  await audit(user.id, "UPDATE_CERTIFICATIONS", "Soldier", soldierId, { count: certTypeIds.length });
  revalidatePath("/certifications");
  revalidatePath("/soldiers");
}
