"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

/** הגשת בקשת סיפוח — נגיש לכל מי שמנהל חיילים (מפ"מ / שלישות) */
export async function submitAttachmentRequest(formData: FormData) {
  const user = await requireCapability("company.manage");
  const bId = user.battalionId!;

  const soldierName = String(formData.get("soldierName") || "").trim();
  const personalNumber = String(formData.get("personalNumber") || "").trim() || null;
  const phone = String(formData.get("phone") || "").trim() || null;
  const sourceUnit = String(formData.get("sourceUnit") || "").trim() || null;
  const targetCompanyId = String(formData.get("targetCompanyId") || "") || null;
  const fullEmployment = formData.get("fullEmployment") === "on";
  const fromDate = String(formData.get("fromDate") || "");
  const toDate = String(formData.get("toDate") || "");
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!soldierName) throw new Error("חובה להזין שם חייל");
  if (!fullEmployment && (!fromDate || !toDate)) throw new Error("חובה לציין טווח תאריכים או לסמן ״כל התעסוקה״");
  if (!fullEmployment && new Date(toDate) < new Date(fromDate)) throw new Error("תאריך סיום חייב להיות אחרי תאריך התחלה");

  const req = await prisma.attachmentRequest.create({
    data: {
      battalionId: bId,
      soldierName,
      personalNumber,
      phone,
      sourceUnit,
      targetCompanyId,
      fromDate: fullEmployment ? new Date("2020-01-01") : new Date(fromDate),
      toDate: fullEmployment ? new Date("2099-12-31") : new Date(toDate),
      notes,
      status: "REQUESTED",
      requestedById: user.id,
      statusLog: {
        create: {
          status: "REQUESTED",
          note: "בקשה הוגשה",
          changedById: user.id,
        },
      },
    },
  });

  await audit(user.id, "CREATE_ATTACHMENT_REQUEST", "AttachmentRequest", req.id, { soldierName, fromDate, toDate });
  revalidatePath("/roster");
  revalidatePath("/soldiers");
}

/** עדכון סטטוס בקשת סיפוח — שלישות בלבד */
export async function updateAttachmentRequestStatus(formData: FormData) {
  const user = await requireCapability("soldiers.roster");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const newStatus = String(formData.get("status") || "") as "SUBMITTED" | "REMINDED" | "APPROVED" | "REJECTED";
  const note = String(formData.get("note") || "").trim() || null;

  if (!["SUBMITTED", "REMINDED", "APPROVED", "REJECTED"].includes(newStatus)) {
    throw new Error("סטטוס לא תקין");
  }

  const req = await prisma.attachmentRequest.findUnique({ where: { id } });
  if (!req || req.battalionId !== bId) throw new Error("בקשה לא נמצאה");
  if (req.status === "APPROVED") throw new Error("הבקשה כבר אושרה");
  if (req.status === "REJECTED" && newStatus !== "SUBMITTED") throw new Error("לא ניתן לעדכן בקשה שנדחתה — אלא לפתוח מחדש");

  if (newStatus === "APPROVED") {
    const soldier = await prisma.soldier.create({
      data: {
        battalionId: bId,
        fullName: req.soldierName,
        firstName: req.soldierName.split(" ")[0] || req.soldierName,
        lastName: req.soldierName.split(" ").slice(1).join(" ") || "",
        personalNumber: req.personalNumber,
        phone: req.phone,
        companyId: req.targetCompanyId,
        attached: true,
        status: "ENLISTED",
        enlistedAt: new Date(),
        enlistedById: user.id,
      },
    });

    await prisma.attachmentRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        soldierId: soldier.id,
        statusLog: {
          create: { status: "APPROVED", note: note || "סיפוח אושר — חייל הוקם", changedById: user.id },
        },
      },
    });

    await audit(user.id, "APPROVE_ATTACHMENT", "AttachmentRequest", id, { soldierId: soldier.id });
  } else {
    const statusLabels: Record<string, string> = {
      SUBMITTED: "הוגשה בקשה",
      REMINDED: "הוגשה תזכורת",
      REJECTED: "לא אושר",
    };

    await prisma.attachmentRequest.update({
      where: { id },
      data: {
        status: newStatus,
        statusLog: {
          create: { status: newStatus, note: note || statusLabels[newStatus], changedById: user.id },
        },
      },
    });

    await audit(user.id, "UPDATE_ATTACHMENT_STATUS", "AttachmentRequest", id, { status: newStatus });
  }

  revalidatePath("/roster");
  revalidatePath("/soldiers");
}
