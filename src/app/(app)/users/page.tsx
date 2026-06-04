import Link from "next/link";
import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/rbac";
import SettingsTabs from "@/components/SettingsTabs";
import UsersManager from "./UsersManager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const admin = await requireCapability("users.manage");
  const bId = admin.battalionId!;

  const [users, holders, customRoles] = await Promise.all([
    prisma.appUser.findMany({
      where: { battalionId: bId, role: { in: ["WAREHOUSE_MANAGER", "COMPANY_REP", "VIEWER"] } },
      orderBy: { createdAt: "asc" },
      include: { holder: true, customRole: true, assignedHolders: { include: { holder: true } } },
    }),
    prisma.holder.findMany({ where: { battalionId: bId, active: true }, orderBy: { name: "asc" } }),
    prisma.customRole.findMany({ where: { battalionId: bId, active: true }, orderBy: { name: "asc" } }),
  ]);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  return (
    <div>
      <PageHeader
        title="הגדרות גדוד"
        subtitle="פרופיל, מבנה ארגוני ומשתמשים"
        action={<Link href="/roles" className="text-sm bg-white border border-slate-300 rounded-lg px-4 py-2 hover:bg-slate-50">ניהול תפקידים</Link>}
      />
      <SettingsTabs active="users" />
      <UsersManager
        baseUrl={baseUrl}
        holders={holders.map((h) => ({ id: h.id, name: h.name, kind: h.kind }))}
        customRoles={customRoles.map((r) => ({ id: r.id, name: r.name, template: r.template }))}
        users={users.map((u) => ({
          id: u.id, fullName: u.fullName, username: u.username, phone: u.phone,
          role: u.role, customRoleId: u.customRoleId,
          roleLabel: u.customRole?.name ?? ROLE_LABELS[u.role],
          holderId: u.holderId,
          holderNames: (() => {
            const names = u.assignedHolders.map((a) => a.holder.name);
            if (u.holder && !names.includes(u.holder.name)) names.unshift(u.holder.name);
            return names;
          })(),
          active: u.active, passwordSet: u.passwordSet, inviteToken: u.inviteToken,
        }))}
      />
    </div>
  );
}
