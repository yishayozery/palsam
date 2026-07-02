import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import SettingsTabs from "@/components/SettingsTabs";
import WeaponsPolicyForm from "./WeaponsPolicyForm";

export const dynamic = "force-dynamic";

export default async function WeaponsPolicyPage() {
  const user = await requireCapability("battalion.profile");
  const battalion = await prisma.battalion.findUnique({ where: { id: user.battalionId! } });
  if (!battalion) return null;

  return (
    <div>
      <PageHeader title="הגדרות גדוד" subtitle="פרופיל, מבנה ארגוני ומשתמשים" />
      <SettingsTabs active="weapons" />
      <Card className="p-6 max-w-xl">
        <h3 className="text-sm font-bold text-slate-700 mb-3">🔫 תנאים מוקדמים לחתימת נשק</h3>
        <WeaponsPolicyForm
          policy={{
            requireEnlistment: battalion.requireEnlistment,
            requireWeaponsApproval: battalion.requireWeaponsApproval,
            requireArmoryTest: battalion.requireArmoryTest,
            requireWeaponsAgreement: battalion.requireWeaponsAgreement,
          }}
        />
      </Card>
    </div>
  );
}
