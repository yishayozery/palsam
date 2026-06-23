import { requireAdmin } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import { SCREENS, SCREEN_KEYS, PRESET_ROLES } from "@/lib/rbac";
import SettingsTabs from "@/components/SettingsTabs";
import RolesClient from "./RolesClient";
import { seedPresetRoles } from "./actions";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const user = await requireAdmin();
  const bId = user.battalionId!;

  const roles = await prisma.systemRole.findMany({
    where: { battalionId: bId, active: true },
    orderBy: { sortOrder: "asc" },
    include: {
      permissions: true,
      _count: { select: { users: true } },
    },
  });

  const presetNames = new Set(roles.filter((r) => r.isPreset).map((r) => r.name));
  const missingPresets = PRESET_ROLES.filter((p) => !presetNames.has(p.name));
  const hasAllPresets = missingPresets.length === 0;

  return (
    <div>
      <PageHeader
        title="הגדרות גדוד"
        subtitle="הגדרת תפקידים עם הרשאות מסכים — כל משתמש מקבל תפקיד אחד"
      />
      <SettingsTabs active="roles" />

      {!hasAllPresets && (
        <Card className="p-4 mb-4 bg-amber-50 border-amber-200">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-amber-800">
              {presetNames.size === 0
                ? "לא נמצאו תפקידים מוגדרים. לחץ כדי ליצור את תפקידי ברירת המחדל."
                : `חסרים ${missingPresets.length} תפקידים מובנים (${missingPresets.map((p) => p.name).join(", ")}). לחץ להוספה.`}
            </p>
            <form action={seedPresetRoles}>
              <button className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 whitespace-nowrap">
                {presetNames.size === 0 ? "יצירת תפקידי ברירת מחדל" : "הוסף תפקידים חסרים"}
              </button>
            </form>
          </div>
        </Card>
      )}

      <RolesClient
        roles={roles.map((r) => ({
          id: r.id,
          name: r.name,
          isPreset: r.isPreset,
          isAdmin: r.isAdmin,
          isCommander: r.isCommander,
          userCount: r._count.users,
          permissions: Object.fromEntries(r.permissions.map((p) => [p.screen, p.level])),
        }))}
        screens={SCREENS}
        screenKeys={SCREEN_KEYS}
      />
    </div>
  );
}
