"use server";

import { prisma } from "@/lib/prisma";

export async function submitVerification(
  token: string,
  responses: {
    itemId: string;
    found: boolean;
    photoData?: string;
    note?: string;
    reportedSerial?: string;
    reportedLocation?: string;
    reportedQuantity?: number;
    reportedExpiry?: string;
  }[],
) {
  const req = await prisma.verificationRequest.findUnique({
    where: { token },
    select: { id: true, respondedAt: true },
  });
  if (!req) return { error: "בקשה לא נמצאה" };
  if (req.respondedAt) return { error: "כבר דווח" };

  await prisma.$transaction(
    responses.map((r) =>
      prisma.verificationItem.update({
        where: { id: r.itemId },
        data: {
          status: r.found ? "CONFIRMED" : "DENIED",
          photoData: r.photoData || null,
          note: r.note || null,
          reportedSerial: r.reportedSerial || null,
          reportedLocation: r.reportedLocation || null,
          reportedQuantity: r.reportedQuantity ?? null,
          reportedExpiry: r.reportedExpiry ? new Date(r.reportedExpiry) : null,
          respondedAt: new Date(),
        },
      }),
    ),
  );

  await prisma.verificationRequest.update({
    where: { id: req.id },
    data: { respondedAt: new Date() },
  });

  return { ok: true };
}
