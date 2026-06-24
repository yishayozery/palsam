"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { audit } from "@/lib/audit";
import type { ScheduleEventType } from "@/generated/prisma";

export async function createEvent(formData: FormData) {
  const user = await requireUser();
  const bId = user.battalionId!;
  const name = String(formData.get("name") || "").trim();
  const type = String(formData.get("type") || "MUKDAM_MEASEF") as ScheduleEventType;
  const startDate = String(formData.get("startDate") || "");
  const endDate = String(formData.get("endDate") || "");
  const approverIds: string[] = JSON.parse(String(formData.get("approverIds") || "[]"));
  if (!name || !startDate || !endDate) return { error: "יש למלא שם, תאריך התחלה ותאריך סיום" };

  const event = await prisma.$transaction(async (tx) => {
    const ev = await tx.scheduleEvent.create({
      data: {
        battalionId: bId,
        name,
        type,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        createdById: user.id,
      },
    });
    if (approverIds.length > 0) {
      await tx.scheduleApprover.createMany({
        data: approverIds.map((uid) => ({ eventId: ev.id, userId: uid })),
      });
    }
    return ev;
  });
  await audit(user.id, "CREATE", "ScheduleEvent", event.id, { name, type });
  revalidatePath("/vacation");
  revalidatePath("/vacation/schedule");
  return { ok: true, id: event.id };
}

export async function updateEvent(formData: FormData) {
  const user = await requireUser();
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const startDate = String(formData.get("startDate") || "");
  const endDate = String(formData.get("endDate") || "");
  const notes = String(formData.get("notes") || "").trim() || null;
  const approverIds: string[] = JSON.parse(String(formData.get("approverIds") || "[]"));

  const existing = await prisma.scheduleEvent.findUnique({ where: { id }, select: { battalionId: true } });
  if (!existing || existing.battalionId !== bId) return { error: "אירוע לא נמצא" };

  await prisma.$transaction(async (tx) => {
    await tx.scheduleEvent.update({
      where: { id },
      data: { name, startDate: new Date(startDate), endDate: new Date(endDate), notes },
    });
    await tx.scheduleApprover.deleteMany({ where: { eventId: id } });
    if (approverIds.length > 0) {
      await tx.scheduleApprover.createMany({
        data: approverIds.map((uid) => ({ eventId: id, userId: uid })),
      });
    }
  });
  await audit(user.id, "UPDATE", "ScheduleEvent", id, { name });
  revalidatePath("/vacation/schedule");
  revalidatePath(`/vacation/schedule/${id}`);
  return { ok: true };
}

export async function deleteEvent(formData: FormData) {
  const user = await requireUser();
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const existing = await prisma.scheduleEvent.findUnique({ where: { id }, select: { battalionId: true } });
  if (!existing || existing.battalionId !== bId) return { error: "אירוע לא נמצא" };

  await prisma.scheduleEvent.update({ where: { id }, data: { active: false } });
  await audit(user.id, "DELETE", "ScheduleEvent", id);
  revalidatePath("/vacation");
  revalidatePath("/vacation/schedule");
  return { ok: true };
}

export async function addForce(formData: FormData) {
  const user = await requireUser();
  const bId = user.battalionId!;
  const eventId = String(formData.get("eventId") || "");
  const userId = String(formData.get("userId") || "");
  const forceName = String(formData.get("forceName") || "").trim();
  if (!eventId || !userId || !forceName) return { error: "יש למלא את כל השדות" };

  const event = await prisma.scheduleEvent.findUnique({ where: { id: eventId }, select: { battalionId: true } });
  if (!event || event.battalionId !== bId) return { error: "אירוע לא נמצא" };

  const existing = await prisma.scheduleForce.findUnique({ where: { eventId_userId: { eventId, userId } } });
  if (existing) return { error: "המשתמש כבר מוזמן לאירוע" };

  await prisma.scheduleForce.create({ data: { eventId, userId, forceName } });
  await audit(user.id, "CREATE", "ScheduleForce", eventId, { userId, forceName });
  revalidatePath(`/vacation/schedule/${eventId}`);
  return { ok: true };
}

export async function removeForce(formData: FormData) {
  const user = await requireUser();
  const bId = user.battalionId!;
  const forceId = String(formData.get("forceId") || "");

  const force = await prisma.scheduleForce.findUnique({
    where: { id: forceId },
    include: { event: { select: { battalionId: true, id: true } } },
  });
  if (!force || force.event.battalionId !== bId) return { error: "כח לא נמצא" };

  await prisma.scheduleForce.delete({ where: { id: forceId } });
  await audit(user.id, "DELETE", "ScheduleForce", forceId);
  revalidatePath(`/vacation/schedule/${force.eventId}`);
  return { ok: true };
}

export async function saveDayEntry(formData: FormData) {
  const user = await requireUser();
  const bId = user.battalionId!;
  const forceId = String(formData.get("forceId") || "");
  const eventId = String(formData.get("eventId") || "");
  const dateStr = String(formData.get("date") || "");
  const plannedTasks = String(formData.get("plannedTasks") || "").trim() || null;
  const actualTasks = String(formData.get("actualTasks") || "").trim() || null;
  const plannedNotes = String(formData.get("plannedNotes") || "").trim() || null;
  const actualNotes = String(formData.get("actualNotes") || "").trim() || null;
  const plannedSoldierIds: string[] = JSON.parse(String(formData.get("plannedSoldierIds") || "[]"));
  const actualSoldierIds: string[] = JSON.parse(String(formData.get("actualSoldierIds") || "[]"));

  const force = await prisma.scheduleForce.findUnique({
    where: { id: forceId },
    include: { event: { select: { battalionId: true, createdById: true } } },
  });
  if (!force || force.event.battalionId !== bId) return { error: "כח לא נמצא" };

  if (force.userId !== user.id && force.event.createdById !== user.id && !user.isAdmin) {
    return { error: "אין הרשאה לעדכן כח זה" };
  }

  const date = new Date(dateStr);

  await prisma.$transaction(async (tx) => {
    const entry = await tx.scheduleDayEntry.upsert({
      where: { forceId_date: { forceId, date } },
      create: { eventId, forceId, date, plannedTasks, actualTasks, plannedNotes, actualNotes, approved: false },
      update: { plannedTasks, actualTasks, plannedNotes, actualNotes, approved: false, approvedAt: null, approvedById: null },
    });

    await tx.scheduleDaySoldier.deleteMany({ where: { dayEntryId: entry.id } });

    const soldierData = [
      ...plannedSoldierIds.map((sid) => ({ dayEntryId: entry.id, soldierId: sid, phase: "planned" })),
      ...actualSoldierIds.map((sid) => ({ dayEntryId: entry.id, soldierId: sid, phase: "actual" })),
    ];
    if (soldierData.length > 0) {
      await tx.scheduleDaySoldier.createMany({ data: soldierData });
    }
  });

  await audit(user.id, "UPDATE", "ScheduleDayEntry", forceId, { date: dateStr });
  revalidatePath(`/vacation/schedule/${eventId}`);
  return { ok: true };
}

export async function approveDayEntry(formData: FormData) {
  const user = await requireUser();
  const bId = user.battalionId!;
  const entryId = String(formData.get("entryId") || "");
  const approve = formData.get("approve") !== "false";

  const entry = await prisma.scheduleDayEntry.findUnique({
    where: { id: entryId },
    include: {
      event: {
        select: { battalionId: true, createdById: true, approvers: { select: { userId: true } } },
      },
    },
  });
  if (!entry || entry.event.battalionId !== bId) return { error: "רשומה לא נמצאה" };

  const isApprover = entry.event.approvers.some((a) => a.userId === user.id);
  if (!isApprover && entry.event.createdById !== user.id && !user.isAdmin) {
    return { error: "אין הרשאת אישור" };
  }

  await prisma.scheduleDayEntry.update({
    where: { id: entryId },
    data: approve
      ? { approved: true, approvedAt: new Date(), approvedById: user.id }
      : { approved: false, approvedAt: null, approvedById: null },
  });

  await audit(user.id, approve ? "APPROVE" : "UNAPPROVE", "ScheduleDayEntry", entryId);
  revalidatePath(`/vacation/schedule/${entry.eventId}`);
  return { ok: true };
}
