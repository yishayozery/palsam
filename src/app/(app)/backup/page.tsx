import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import BackupClient from "./BackupClient";

export const dynamic = "force-dynamic";

export default async function BackupPage() {
  const user = await requireUser();
  if (!can(user, "battalion.profile")) redirect("/");

  return (
    <div>
      <PageHeader
        title="📂 בדיקת קובץ גיבוי"
        subtitle="העלה קובץ אקסל שנשלח במייל ובדוק שכל התנועות קיימות במערכת"
      />
      <BackupClient />
    </div>
  );
}
