import { requireAdmin } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card } from "@/components/ui";
import { SCREENS, SCREEN_KEYS } from "@/lib/rbac";
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

  const hasPresets = roles.some((r) => r.isPreset);

  return (
    <div>
      <PageHeader
        title="ניהול תפקידים והרשאות"
        subtitle="הגדרת תפקידים עם הרשאות מסכים — כל משתמש מקבל תפקיד אחד"
      />

      {!hasPresets && (
        <Card className="p-4 mb-4 bg-amber-50 border-amber-200">
          <div className="flex items-center justify-between">
            <p className="text-sm text-amber-800">
              לא נמצאו תפקידים מוגדרים. לחץ כדי ליצור את תפקידי ברירת המחדל.
            </p>
            <form action={seedPresetRoles}>
              <button className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
                יצירת תפקידי ברירת מחדל
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
