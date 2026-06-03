import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/rbac";
import CrudSection from "@/components/CrudSection";
import { saveUser, toggleUser } from "./actions";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requireCapability("users.manage");

  const [users, holders] = await Promise.all([
    prisma.appUser.findMany({ orderBy: { createdAt: "asc" }, include: { holder: true } }),
    prisma.holder.findMany({ where: { active: true, type: { in: ["COMPANY", "ARMORY"] } } }),
  ]);

  return (
    <div>
      <PageHeader title="ניהול משתמשים" subtitle="משתמשי המערכת והרשאותיהם" />
      <CrudSection
        title="משתמשים"
        addLabel="משתמש"
        fields={[
          { name: "fullName", label: "שם מלא" },
          { name: "username", label: "שם משתמש" },
          { name: "password", label: "סיסמה (ריק = ללא שינוי)" },
          {
            name: "role", label: "תפקיד", type: "select", default: "VIEWER",
            options: (Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map((r) => ({ value: r, label: ROLE_LABELS[r] })),
          },
          {
            name: "holderId", label: "שיוך (רס\"פ/ארמון)", type: "select",
            options: [{ value: "", label: "—" }, ...holders.map((h) => ({ value: h.id, label: h.name }))],
          },
        ]}
        saveAction={saveUser}
        deleteAction={toggleUser}
        rows={users.map((u) => ({
          id: u.id,
          values: { fullName: u.fullName, username: u.username, role: u.role, holderId: u.holderId ?? "", password: "" },
          display: (
            <span className="flex items-center gap-2">
              <span className="font-medium">{u.fullName}</span>
              <span className="text-xs text-slate-400 font-mono">@{u.username}</span>
              <Badge className="bg-slate-200 text-slate-700">{ROLE_LABELS[u.role]}</Badge>
              {u.holder && <Badge className="bg-blue-100 text-blue-700">{u.holder.name}</Badge>}
              {!u.active && <Badge className="bg-rose-100 text-rose-700">מושבת</Badge>}
            </span>
          ),
        }))}
      />
    </div>
  );
}
