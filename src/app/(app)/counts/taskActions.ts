"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { audit } from "@/lib/audit";

/** התחלת ספירה ממשימת CountTask — מוליד CountSession ומחבר חזרה. */
export async function startCountFromTask(formData: FormData) {
  const user = await requireUser();
  const taskId = String(formData.get("taskId") || "");
  if (!taskId) return;

  const task = await prisma.countTask.findUnique({
    where: { id: taskId },
    include: { holder: true, plan: true },
  });
  if (!task || task.battalionId !== user.battalionId) return;
  if (task.sessionId) {
    redirect(`/counts/${task.sessionId}`);
    return;
  }

  // קביעת סוג הספירה — לפי kind של ה-holder
  const type = task.holder.kind === "WAREHOUSE" ? "WAREHOUSE" : "COMPANY";

  const session = await prisma.countSession.create({
    data: {
      battalionId: task.battalionId,
      type,
      status: "IN_PROGRESS",
      startedById: user.id,
    },
  });

  await prisma.countTask.update({
    where: { id: taskId },
    data: { sessionId: session.id, status: "IN_PROGRESS", startedAt: new Date() },
  });

  await audit(user.id, "START_COUNT_FROM_TASK", "CountTask", taskId, { sessionId: session.id });
  redirect(`/counts/${session.id}`);
}
