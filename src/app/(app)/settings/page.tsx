import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { PageHeader, Card } from "@/components/ui";
import SettingsTabs from "@/components/SettingsTabs";
import OperationalSettingsForm from "./OperationalSettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireCapability("battalion.profile");
  const battalion = await prisma.battalion.findUnique({ where: { id: user.battalionId! } });
  if (!battalion) return null;

  return (
    <div>
      <PageHeader title="הגדרות גדוד" subtitle="פרופיל, מבנה ארגוני ומשתמשים" />
      <SettingsTabs active="ops" />
      <Card className="p-6 max-w-xl">
        <OperationalSettingsForm
          battalion={{
            requirePersonalIdOnHandover: battalion.requirePersonalIdOnHandover,
            senderEmail: battalion.senderEmail,
            notificationEmail: battalion.notificationEmail,
            emailToBattalion: battalion.emailToBattalion,
            armoryTestUrl: battalion.armoryTestUrl,
            telegramBotToken: battalion.telegramBotToken ? decryptSecret(battalion.telegramBotToken) : null,
            telegramBotInfo: battalion.telegramBotInfo,
            telegramBotUsername: battalion.telegramBotUsername,
            soldierDepartureMessage: battalion.soldierDepartureMessage,
          }}
        />
      </Card>
    </div>
  );
}
