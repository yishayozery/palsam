import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/rbac";
import CrudSection from "@/components/CrudSection";
import { saveRole, deleteRole } from "./actions";

export const dynamic = "force-dynamic";

const TEMPLATE_OPTIONS = [
  { value: "VIEWER", label: "צפייה בלבד" },
  { value: "COMPANY_REP", label: "תפעול פלוגתי (כמו רס\"פ)" },
  { value: "WAREHOUSE_MANAGER", label: "תפעול מחסן (כמו קצין מחסן)" },
];

export default async function RolesPage() {
  const user = await requireCapability("users.manage");
  const bId = user.battalionId!;

  const roles = await prisma.customRole.findMany({
    where: { battalionId: bId, active: true },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { users: true } } },
  });

  return (
    <div>
      <PageHeader
        title="תפקידים"
        subtitle="הוספת תפקידים בשמות משלך, מבוססים על פרופיל הרשאות קיים"
      />
      <Card className="p-4 mb-4 bg-blue-50 border-blue-200">
        <p className="text-sm text-blue-800">
          המערכת מבוססת על שני פרופילי הרשאה: <b>צפייה בלבד</b> ו<b>תפעול</b> (פלוגתי/מחסן).
          כאן ניתן ליצור תפקידים בשמות חופשיים (למשל מ"פ, מ"כ, קצין ביטחון) שמשתמשים באותם פרופילים.
        </p>
      </Card>
      <CrudSection
        title="תפקידים מותאמים"
        addLabel="תפקיד"
        fields={[
          { name: "name", label: "שם התפקיד" },
          { name: "template", label: "פרופיל הרשאות", type: "select", default: "VIEWER", options: TEMPLATE_OPTIONS },
        ]}
        saveAction={saveRole}
        deleteAction={deleteRole}
        rows={roles.map((r) => ({
          id: r.id,
          values: { name: r.name, template: r.template },
          locked: r._count.users > 0,
          display: (
            <span className="flex items-center gap-1.5">
              {r.name}
              <Badge className="bg-slate-100 text-slate-600">בסיס: {ROLE_LABELS[r.template]}</Badge>
              {r._count.users > 0 && <Badge className="bg-blue-100 text-blue-700">{r._count.users} משתמשים</Badge>}
            </span>
          ),
        }))}
      />
    </div>
  );
}
