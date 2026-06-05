import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * "התחל ספירה דרך לינק" — משתמש מחובר ניגש דרך WhatsApp link, מוליד CountSession ומפנה אליה.
 */
export default async function StartFromShare({ params }: { params: Promise<{ token: string }> }) {
  const user = await requireUser();
  const { token } = await params;

  const task = await prisma.countTask.findUnique({
    where: { shareToken: token },
    include: { holder: true },
  });
  if (!task || task.battalionId !== user.battalionId) {
    redirect("/counts");
  }
  if (task!.sessionId) {
    redirect(`/counts/${task!.sessionId}`);
  }

  const type = task!.holder.kind === "WAREHOUSE" ? "WAREHOUSE" : "COMPANY";
  const session = await prisma.countSession.create({
    data: { battalionId: task!.battalionId, type, status: "IN_PROGRESS", startedById: user.id },
  });
  await prisma.countTask.update({
    where: { id: task!.id },
    data: { sessionId: session.id, status: "IN_PROGRESS", startedAt: new Date(), assignedUserId: user.id },
  });
  await audit(user.id, "START_COUNT_FROM_SHARE", "CountTask", task!.id, { sessionId: session.id });
  redirect(`/counts/${session.id}`);
}
