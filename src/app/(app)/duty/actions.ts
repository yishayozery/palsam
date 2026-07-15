"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import type { DutyVisibility, Prisma } from "@/generated/prisma";

type Sessionish = Awaited<ReturnType<typeof requireUser>>;
function isManager(user: Sessionish): boolean {
  return !!user.isAdmin || can(user, "battalion.profile");
}

/** יוזם מקים לוח משימות. */
export async function createBoard(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const bId = user.battalionId!;
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "הזן שם ללוח" };
  const visibility = (String(formData.get("visibility") || "ALL") === "SELECTED" ? "SELECTED" : "ALL") as DutyVisibility;
  const fromDate = String(formData.get("fromDate") || "").trim();
  const toDate = String(formData.get("toDate") || "").trim();
  const board = await prisma.dutyBoard.create({
    data: {
      battalionId: bId, name, visibility,
      fromDate: fromDate ? new Date(fromDate) : null,
      toDate: toDate ? new Date(toDate) : null,
      defaultStart: String(formData.get("defaultStart") || "").trim() || null,
      defaultEnd: String(formData.get("defaultEnd") || "").trim() || null,
      notes: String(formData.get("notes") || "").trim() || null,
      createdById: user.id, createdByName: user.fullName ?? null,
    },
  });
  await audit(user.id, "CREATE_DUTY_BOARD", "DutyBoard", board.id, { name });
  revalidatePath("/duty");
  return { ok: true };
}

async function loadBoard(id: string, bId: string) {
  return prisma.dutyBoard.findFirst({ where: { id, battalionId: bId }, select: { id: true, createdById: true, fromDate: true, toDate: true } });
}

/** עריכת לוח קיים (שם / טווח / שעות ברירת-מחדל / נראוּת / הערות). */
export async function updateBoard(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const board = await loadBoard(String(formData.get("id") || ""), user.battalionId!);
  if (!board) return { error: "לוח לא נמצא" };
  if (board.createdById !== user.id && !isManager(user)) return { error: "רק יוזם הלוח/מפמ יכול לערוך" };
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "הזן שם ללוח" };
  const fromDate = String(formData.get("fromDate") || "").trim();
  const toDate = String(formData.get("toDate") || "").trim();
  if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) return { error: "תאריך התחלה מאוחר מהסיום" };
  await prisma.dutyBoard.update({
    where: { id: board.id },
    data: {
      name,
      visibility: (String(formData.get("visibility") || "ALL") === "SELECTED" ? "SELECTED" : "ALL") as DutyVisibility,
      fromDate: fromDate ? new Date(fromDate) : null,
      toDate: toDate ? new Date(toDate) : null,
      defaultStart: String(formData.get("defaultStart") || "").trim() || null,
      defaultEnd: String(formData.get("defaultEnd") || "").trim() || null,
      notes: String(formData.get("notes") || "").trim() || null,
      allowSelfSchedule: formData.get("allowSelfSchedule") === "on",
    },
  });
  revalidatePath("/duty");
  return { ok: true };
}

export async function deleteBoard(formData: FormData): Promise<void> {
  const user = await requireUser();
  const board = await loadBoard(String(formData.get("id") || ""), user.battalionId!);
  if (!board) return;
  if (board.createdById !== user.id && !isManager(user)) return;
  await prisma.dutyBoard.delete({ where: { id: board.id } });
  revalidatePath("/duty");
}

/** הוספת משבצת ללוח (תאריך + שעות + פלוגה/מחלקה + חייל אחראי). */
export async function addSlot(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const bId = user.battalionId!;
  const boardId = String(formData.get("boardId") || "");
  const board = await loadBoard(boardId, bId);
  if (!board) return { error: "לוח לא נמצא" };
  if (board.createdById !== user.id && !isManager(user)) return { error: "רק יוזם הלוח/מפמ יכול להוסיף משבצות" };
  const date = String(formData.get("date") || "").trim();
  if (!date) return { error: "בחר תאריך" };
  const slotDate = new Date(date);
  // ✅ ולידציה: התאריך בטווח הלוח
  if (board.fromDate && slotDate < board.fromDate) return { error: `התאריך מוקדם מטווח הלוח (${board.fromDate.toISOString().slice(0, 10)})` };
  if (board.toDate && slotDate > board.toDate) return { error: `התאריך מאוחר מטווח הלוח (${board.toDate.toISOString().slice(0, 10)})` };
  const companyId = String(formData.get("companyId") || "").trim() || null;
  const squadId = String(formData.get("squadId") || "").trim() || null;
  const responsibleSoldierId = String(formData.get("responsibleSoldierId") || "").trim() || null;
  const capacity = Math.max(1, parseInt(String(formData.get("capacity") || "1"), 10) || 1);
  const startTime = String(formData.get("startTime") || "").trim() || null;
  const endTime = String(formData.get("endTime") || "").trim() || null;
  const label = String(formData.get("label") || "").trim() || null;
  // ✅ ולידציה: אין כפילות לאותו תאריך+שעה+עמדה+פלוגה
  const dup = await prisma.dutySlot.findFirst({ where: { boardId, date: slotDate, startTime, endTime, label, companyId }, select: { id: true } });
  if (dup) return { error: "כבר קיימת משבצת זהה (תאריך+שעה+עמדה). שנה זמן/עמדה." };
  await prisma.dutySlot.create({
    data: { boardId, date: slotDate, startTime, endTime, label, companyId, squadId, responsibleSoldierId, capacity, createdById: user.id },
  });
  revalidatePath("/duty");
  return { ok: true };
}

export async function deleteSlot(formData: FormData): Promise<void> {
  const user = await requireUser();
  const bId = user.battalionId!;
  const slot = await prisma.dutySlot.findFirst({ where: { id: String(formData.get("id") || ""), board: { battalionId: bId } }, select: { id: true, board: { select: { createdById: true } } } });
  if (!slot) return;
  if (slot.board.createdById !== user.id && !isManager(user)) return;
  await prisma.dutySlot.delete({ where: { id: slot.id } });
  revalidatePath("/duty");
}

/** שיבוץ חייל למשבצת + התראה בבוט. */
export async function assignSoldier(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const bId = user.battalionId!;
  const slotId = String(formData.get("slotId") || "");
  const soldierId = String(formData.get("soldierId") || "").trim();
  if (!soldierId) return { error: "בחר חייל" };
  const slot = await prisma.dutySlot.findFirst({
    where: { id: slotId, board: { battalionId: bId } },
    select: { id: true, date: true, startTime: true, endTime: true, label: true, capacity: true, responsibleSoldierId: true, board: { select: { name: true, createdById: true } }, assignments: { select: { soldierId: true } } },
  });
  if (!slot) return { error: "משבצת לא נמצאה" };
  // הרשאה: יוזם/מפמ, או החייל האחראי על המשבצת (קסקדה)
  const mySoldierId = (await prisma.appUser.findUnique({ where: { id: user.id }, select: { soldierId: true } }))?.soldierId ?? null;
  const isResp = slot.board.createdById === user.id || isManager(user) || (!!mySoldierId && mySoldierId === slot.responsibleSoldierId);
  if (!isResp) return { error: "אין לך הרשאה לשבץ במשבצת זו" };
  // ✅ אכיפת קיבולת (למשל 2 חיילים למשבצת) — אלא אם החייל כבר משובץ
  const already = slot.assignments.some((a) => a.soldierId === soldierId);
  if (!already && slot.assignments.length >= slot.capacity) return { error: `המשבצת מלאה (${slot.capacity} חיילים)` };
  const soldier = await prisma.soldier.findFirst({ where: { id: soldierId, battalionId: bId }, select: { id: true, fullName: true, telegramChatId: true } });
  if (!soldier) return { error: "חייל לא נמצא" };

  const created = await prisma.dutyAssignment.upsert({
    where: { slotId_soldierId: { slotId, soldierId } },
    update: {}, create: { slotId, soldierId, assignedById: user.id, assignedByName: user.fullName ?? null },
  });

  // 🔔 התראה למשובץ
  if (soldier.telegramChatId) {
    const bat = await prisma.battalion.findUnique({ where: { id: bId }, select: { telegramBotToken: true } });
    if (bat?.telegramBotToken) {
      const { sendTelegramMessage } = await import("@/lib/telegram");
      const { escapeTelegram } = await import("@/lib/escape-html");
      const when = `${new Date(slot.date).toLocaleDateString("he-IL")}${slot.startTime ? ` ${slot.startTime}${slot.endTime ? `-${slot.endTime}` : ""}` : ""}`;
      await sendTelegramMessage(bat.telegramBotToken, soldier.telegramChatId,
        `🗓️ <b>שובצת למשימה — ${escapeTelegram(slot.board.name)}</b>\n📅 ${when}${slot.label ? `\n📍 ${escapeTelegram(slot.label)}` : ""}`,
      ).catch(() => {});
      await prisma.dutyAssignment.update({ where: { id: created.id }, data: { notifiedAt: new Date() } }).catch(() => {});
    }
  }
  revalidatePath("/duty");
  return { ok: true };
}

export async function unassignSoldier(formData: FormData): Promise<void> {
  const user = await requireUser();
  const bId = user.battalionId!;
  const a = await prisma.dutyAssignment.findFirst({ where: { id: String(formData.get("id") || ""), slot: { board: { battalionId: bId } } }, select: { id: true, slot: { select: { responsibleSoldierId: true, board: { select: { createdById: true } } } } } });
  if (!a) return;
  const mySoldierId = (await prisma.appUser.findUnique({ where: { id: user.id }, select: { soldierId: true } }))?.soldierId ?? null;
  const ok = a.slot.board.createdById === user.id || isManager(user) || (!!mySoldierId && mySoldierId === a.slot.responsibleSoldierId);
  if (!ok) return;
  await prisma.dutyAssignment.delete({ where: { id: a.id } });
  revalidatePath("/duty");
}

/**
 * 🤖 מנוע שיבוץ אוטומטי — ממלא את המשבצות הריקות בלוח בחלוקה הוגנת.
 * לכל משבצת חסרה: בוחר מבריכת הזכאים (מחלקת/פלוגת המשבצת, פעילים, לא בשמ"פ באותו יום)
 * את החיילים עם הכי מעט תורנויות בלוח (least-loaded), בלי כפילות של אותו חייל באותו יום.
 */
export async function autoFillBoard(formData: FormData): Promise<{ error?: string; ok?: boolean; filled?: number }> {
  const user = await requireUser();
  const bId = user.battalionId!;
  const boardId = String(formData.get("boardId") || "");
  const board = await prisma.dutyBoard.findFirst({ where: { id: boardId, battalionId: bId }, select: { id: true, name: true, createdById: true } });
  if (!board) return { error: "לוח לא נמצא" };
  if (board.createdById !== user.id && !isManager(user)) return { error: "רק יוזם הלוח/מפמ יכול לשבץ אוטומטית" };

  const slots = await prisma.dutySlot.findMany({
    where: { boardId },
    select: { id: true, date: true, startTime: true, endTime: true, label: true, capacity: true, companyId: true, squadId: true, assignments: { select: { soldierId: true } } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  if (slots.length === 0) return { error: "אין משבצות בלוח" };

  const dkey = (d: Date) => d.toISOString().slice(0, 10);
  // עומס נוכחי פר-חייל (מאזן הוגן) + מי כבר משובץ באותו יום (מניעת כפילות)
  const load = new Map<string, number>();
  const byDate = new Map<string, Set<string>>();
  for (const s of slots) {
    const k = dkey(s.date);
    if (!byDate.has(k)) byDate.set(k, new Set());
    for (const a of s.assignments) { load.set(a.soldierId, (load.get(a.soldierId) ?? 0) + 1); byDate.get(k)!.add(a.soldierId); }
  }

  const filledAssignments: { soldierId: string; slotIdx: number }[] = [];
  for (let si = 0; si < slots.length; si++) {
    const slot = slots[si];
    const need = slot.capacity - slot.assignments.length - filledAssignments.filter((f) => f.slotIdx === si).length;
    if (need <= 0) continue;
    const where: Prisma.SoldierWhereInput = { battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] } };
    if (slot.squadId) where.squadId = slot.squadId;
    else if (slot.companyId) where.companyId = slot.companyId;
    const pool = await prisma.soldier.findMany({ where, select: { id: true } });
    const dk = dkey(slot.date);
    const dateSet = byDate.get(dk)!;
    const candidates = pool
      .map((p) => p.id)
      .filter((id) => !dateSet.has(id))
      .sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0) || a.localeCompare(b));
    for (let i = 0; i < need && i < candidates.length; i++) {
      const sol = candidates[i];
      await prisma.dutyAssignment.create({ data: { slotId: slot.id, soldierId: sol, assignedById: user.id, assignedByName: `${user.fullName ?? ""} (אוטומטי)` } });
      load.set(sol, (load.get(sol) ?? 0) + 1);
      dateSet.add(sol);
      filledAssignments.push({ soldierId: sol, slotIdx: si });
    }
  }

  // 🔔 התראות בבוט (batched) — רק למי שמקושר
  if (filledAssignments.length) {
    const solIds = [...new Set(filledAssignments.map((f) => f.soldierId))];
    const [bat, chats] = await Promise.all([
      prisma.battalion.findUnique({ where: { id: bId }, select: { telegramBotToken: true } }),
      prisma.soldier.findMany({ where: { id: { in: solIds } }, select: { id: true, telegramChatId: true } }),
    ]);
    const chatMap = new Map(chats.map((c) => [c.id, c.telegramChatId]));
    if (bat?.telegramBotToken) {
      const { sendTelegramMessage } = await import("@/lib/telegram");
      const { escapeTelegram } = await import("@/lib/escape-html");
      for (const f of filledAssignments) {
        const chatId = chatMap.get(f.soldierId);
        if (!chatId) continue;
        const slot = slots[f.slotIdx];
        const when = `${new Date(slot.date).toLocaleDateString("he-IL")}${slot.startTime ? ` ${slot.startTime}${slot.endTime ? `-${slot.endTime}` : ""}` : ""}`;
        await sendTelegramMessage(bat.telegramBotToken, chatId,
          `🗓️ <b>שובצת למשימה — ${escapeTelegram(board.name)}</b>\n📅 ${when}${slot.label ? `\n📍 ${escapeTelegram(slot.label)}` : ""}`).catch(() => {});
      }
    }
  }

  await audit(user.id, "AUTO_FILL_DUTY", "DutyBoard", boardId, { filled: filledAssignments.length });
  revalidatePath("/duty");
  return { ok: true, filled: filledAssignments.length };
}
