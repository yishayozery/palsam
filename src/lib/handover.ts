import { prisma } from "./prisma";

/** מחזיר האם הגדוד דורש מספר אישי בכל מסירה (cache קצר זמן ב-RSC) */
export async function requiresPersonalId(battalionId: string): Promise<boolean> {
  const b = await prisma.battalion.findUnique({
    where: { id: battalionId },
    select: { requirePersonalIdOnHandover: true },
  });
  return !!b?.requirePersonalIdOnHandover;
}

/**
 * שולף + מנקה מספר אישי מהטופס; זורק חריגה אם נדרש וריק.
 * @returns מספר אישי מנוקה (ספרות בלבד) או null
 */
export async function extractPersonalId(
  battalionId: string,
  formData: FormData,
  fieldName: string = "recipientPersonalId",
): Promise<string | null> {
  const raw = String(formData.get(fieldName) || "").trim();
  const cleaned = raw.replace(/\D/g, "");
  const required = await requiresPersonalId(battalionId);
  if (required && !cleaned) {
    throw new Error("PERSONAL_ID_REQUIRED: הגדוד דורש מספר אישי בכל מסירה. אנא הזן מספר אישי של מקבל המסירה.");
  }
  return cleaned || null;
}
