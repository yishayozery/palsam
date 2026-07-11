import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { ensureNotificationRules } from "@/lib/botNotifications";
import NotificationsClient from "./NotificationsClient";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/dashboard");
  const bId = user.battalionId!;

  await ensureNotificationRules(bId);
  const rules = await prisma.botNotificationRule.findMany({
    where: { battalionId: bId },
    orderBy: { createdAt: "asc" },
    select: { id: true, key: true, name: true, description: true, enabled: true, daysBefore: true, recipients: true },
  });

  return (
    <div>
      <PageHeader title="🔔 הודעות בוט" subtitle="שליטה על התזכורות שנשלחות בטלגרם — מה נשלח, למי, ומתי (כמה ימים לפני)." />
      <NotificationsClient rules={rules} />
    </div>
  );
}
