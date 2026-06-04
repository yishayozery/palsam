import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import SettingsTabs from "@/components/SettingsTabs";
import ProfileForm from "./ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireCapability("battalion.profile");
  const battalion = await prisma.battalion.findUnique({ where: { id: user.battalionId! } });
  if (!battalion) return null;

  return (
    <div>
      <PageHeader title="הגדרות גדוד" subtitle="פרופיל, מבנה ארגוני ומשתמשים" />
      <SettingsTabs active="profile" />
      <Card className="p-6 max-w-xl">
        <ProfileForm
          battalion={{
            name: battalion.name, code: battalion.code, brigade: battalion.brigade, commander: battalion.commander,
            motto: battalion.motto, notes: battalion.notes, logoData: battalion.logoData,
            requirePersonalIdOnHandover: battalion.requirePersonalIdOnHandover,
          }}
        />
      </Card>
    </div>
  );
}
