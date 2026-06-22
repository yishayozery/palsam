"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireCapability } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";

/** יצירת/עדכון לוח זמינות — מפ"מ בלבד */
export async function saveBoard(formData: FormData) {
  const user = await requireCapability("battalion.profile");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const startDate = String(formData.get("startDate") || "");
  const endDate = String(formData.get("endDate") || "");
  if (!name || !startDate || !endDate) return;

  if (id) {
    await prisma.vacationBoard.update({
      where: { id },
      data: { name, startDate: new Date(startDate), endDate: new Date(endDate) },
    });
  } else {
    const board = await prisma.vacationBoard.create({
      data: { battalionId: bId, name, startDate: new Date(startDate), endDate: new Date(endDate) },
    });
    // יצירת סטטוסים ברירת מחדל אם אין
    const existing = await prisma.vacationStatus.count({ where: { battalionId: bId } });
    if (existing === 0) {
      await prisma.vacationStatus.createMany({
        data: [
          { battalionId: bId, name: "זמין", color: "#22c55e", icon: "✅", sortOrder: 0 },
          { battalionId: bId, name: "חופשה", color: "#f59e0b", icon: "🏖️", sortOrder: 1 },
        ],
      });
    }
    await audit(user.id, "CREATE", "VacationBoard", board.id);
  }
  revalidatePath("/vacation");
}

/** מחיקת לוח */
export async function deleteBoard(formData: FormData) {
  const user = await requireCapability("battalion.profile");
  const id = String(formData.get("id") || "");
  const board = await prisma.vacationBoard.findUnique({ where: { id } });
  if (!board || board.battalionId !== user.battalionId) return;
  await prisma.vacationBoard.update({ where: { id }, data: { active: false } });
  await audit(user.id, "DELETE", "VacationBoard", id);
  revalidatePath("/vacation");
}

/** הוספת/הסרת משתמשים ללוח */
export async function updateAssignees(formData: FormData) {
  const user = await requireCapability("battalion.profile");
  const boardId = String(formData.get("boardId") || "");
  const userIds = formData.getAll("userId").map(String);
  const board = await prisma.vacationBoard.findUnique({ where: { id: boardId } });
  if (!board || board.battalionId !== user.battalionId) return;

  await prisma.$transaction(async (tx) => {
    await tx.vacationAssignee.deleteMany({ where: { boardId } });
    if (userIds.length > 0) {
      await tx.vacationAssignee.createMany({
        data: userIds.map((userId) => ({ boardId, userId })),
      });
    }
  });
  await audit(user.id, "UPDATE_ASSIGNEES", "VacationBoard", boardId, { count: userIds.length });
  revalidatePath("/vacation");
}

/** עדכון סטטוס זמינות — כל משתמש מעדכן את עצמו */
export async function setVacationEntry(formData: FormData) {
  const user = await requireUser();
  const bId = user.battalionId!;
  const boardId = String(formData.get("boardId") || "");
  const date = String(formData.get("date") || "");
  const statusId = String(formData.get("statusId") || "");

  const board = await prisma.vacationBoard.findUnique({ where: { id: boardId } });
  if (!board || board.battalionId !== bId) return;

  // מפ"מ יכול לעדכן לכל אחד, אחרים רק לעצמם
  const isAdmin = can(user, "battalion.profile");
  let targetUserId = user.id;
  const formUserId = String(formData.get("userId") || "");
  if (formUserId && isAdmin) {
    targetUserId = formUserId;
  }

  // בדיקה שהמשתמש משויך ללוח (או שהוא אדמין)
  if (!isAdmin) {
    const assignee = await prisma.vacationAssignee.findUnique({
      where: { boardId_userId: { boardId, userId: targetUserId } },
    });
    if (!assignee) return;
  }

  if (!statusId) {
    // מחיקת ערך
    await prisma.vacationEntry.deleteMany({
      where: { boardId, userId: targetUserId, date: new Date(date) },
    });
  } else {
    await prisma.vacationEntry.upsert({
      where: { boardId_userId_date: { boardId, userId: targetUserId, date: new Date(date) } },
      update: { statusId },
      create: { boardId, userId: targetUserId, date: new Date(date), statusId },
    });
  }
  revalidatePath(`/vacation/${boardId}`);
}

/** שמירה מרוכזת של שינויים */
export async function saveVacationBatch(
  entries: { boardId: string; userId: string; date: string; statusId: string | null }[],
) {
  const user = await requireUser();
  const bId = user.battalionId!;
  if (entries.length === 0) return;
  const boardId = entries[0].boardId;
  const board = await prisma.vacationBoard.findUnique({ where: { id: boardId } });
  if (!board || board.battalionId !== bId) return;

  const isAdmin = can(user, "battalion.profile");
  if (!isAdmin) {
    const assignee = await prisma.vacationAssignee.findUnique({
      where: { boardId_userId: { boardId, userId: user.id } },
    });
    if (!assignee) return;
  }

  await prisma.$transaction(async (tx) => {
    for (const e of entries) {
      const targetUserId = isAdmin ? e.userId : user.id;
      if (!isAdmin && e.userId !== user.id) continue;
      if (!e.statusId) {
        await tx.vacationEntry.deleteMany({
          where: { boardId, userId: targetUserId, date: new Date(e.date) },
        });
      } else {
        await tx.vacationEntry.upsert({
          where: { boardId_userId_date: { boardId, userId: targetUserId, date: new Date(e.date) } },
          update: { statusId: e.statusId },
          create: { boardId, userId: targetUserId, date: new Date(e.date), statusId: e.statusId },
        });
      }
    }
  });
  revalidatePath(`/vacation/${boardId}`);
}

/** הוספת סטטוס חדש */
export async function saveVacationStatus(formData: FormData) {
  const user = await requireCapability("battalion.profile");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const color = String(formData.get("color") || "#3b82f6");
  const icon = String(formData.get("icon") || "").trim() || null;
  if (!name) return;

  if (id) {
    await prisma.vacationStatus.update({ where: { id }, data: { name, color, icon } });
  } else {
    await prisma.vacationStatus.create({ data: { battalionId: bId, name, color, icon } });
  }
  revalidatePath("/vacation");
}
