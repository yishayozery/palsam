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

  const battalion = await prisma.battalion.findUnique({ where: { id: bId } });

  // מציג רק את "מטה הגדוד" — מפ"מ + צופים. קציני מחסן ורס"פ מנוהלים תחת /org accordion.
  const [users, holders, customRoles, squads] = await Promise.all([
    prisma.appUser.findMany({
      where: { battalionId: bId, role: { in: ["BATTALION_ADMIN", "VIEWER"] } },
      orderBy: { createdAt: "asc" },
      include: { holder: true, customRole: true, assignedHolders: { include: { holder: true } } },
    }),
    prisma.holder.findMany({ where: { battalionId: bId, active: true }, orderBy: { name: "asc" } }),
    prisma.customRole.findMany({ where: { battalionId: bId, active: true }, orderBy: { name: "asc" } }),
    prisma.squad.findMany({
      where: { battalionId: bId, active: true },
      orderBy: [{ company: { name: "asc" } }, { sortOrder: "asc" }],
      include: { company: { select: { name: true } } },
    }),
  ]);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  return (
    <div>
      <PageHeader
        title="הגדרות גדוד"
        subtitle="פרופיל, מבנה ארגוני ומטה גדוד"
        action={<Link href="/roles" className="text-sm bg-white border border-slate-300 rounded-lg px-4 py-2 hover:bg-slate-50">ניהול הרשאות מותאמות</Link>}
      />
      <SettingsTabs active="users" />
      <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 mb-4">
        ⓘ מסך זה מציג רק <b>משתמשי מטה הגדוד</b> (מפ״מ, צופים).
        קציני מחסן ורס״פים — נוהל ב<a href="/org" className="underline font-medium">מבנה ארגוני</a>.
        לרשימת <b>כל המשתמשים במערכת</b> ושליחת הזמנות חוזרות — <a href="/users/all" className="underline font-medium">כל המשתמשים</a>.
      </div>
      <UsersManager
        baseUrl={baseUrl}
        brigade={battalion?.brigade ?? ""}
        battalionCode={battalion?.code ?? ""}
        holders={holders.map((h) => ({ id: h.id, name: h.name, kind: h.kind }))}
        squads={squads.map((s) => ({ id: s.id, name: s.name, companyName: s.company.name }))}
        customRoles={customRoles.map((r) => ({ id: r.id, name: r.name, template: r.template }))}
        users={users.map((u) => ({
          id: u.id, fullName: u.fullName, username: u.username, phone: u.phone, title: u.title,
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
