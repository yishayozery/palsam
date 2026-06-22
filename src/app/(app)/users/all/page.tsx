import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/rbac";
import SettingsTabs from "@/components/SettingsTabs";
import AllUsersTable from "./AllUsersTable";

export const dynamic = "force-dynamic";

export default async function AllUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string }>;
}) {
  const admin = await requireCapability("users.manage");
  const bId = admin.battalionId!;
  const { q = "", role = "", status = "" } = await searchParams;

  const battalion = await prisma.battalion.findUnique({ where: { id: bId }, select: { name: true, brigade: true, code: true } });

  const [users, holders, squads, customRoles, systemRoles] = await Promise.all([
    prisma.appUser.findMany({
      where: { battalionId: bId },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      include: {
        holder: { select: { id: true, name: true, kind: true } },
        assignedHolders: { include: { holder: { select: { id: true, name: true } } } },
        assignedSquads: { select: { squadId: true } },
        customRole: { select: { id: true, name: true } },
        systemRole: { select: { id: true, name: true } },
        soldier: { select: { id: true, fullName: true, personalNumber: true } },
      },
    }),
    prisma.holder.findMany({ where: { battalionId: bId, active: true }, orderBy: { name: "asc" } }),
    prisma.squad.findMany({
      where: { battalionId: bId, active: true },
      orderBy: [{ company: { name: "asc" } }, { sortOrder: "asc" }],
      include: { company: { select: { id: true, name: true } } },
    }),
    prisma.customRole.findMany({ where: { battalionId: bId, active: true }, orderBy: { name: "asc" } }),
    prisma.systemRole.findMany({ where: { battalionId: bId, active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  return (
    <div>
      <PageHeader
        title="הגדרות גדוד"
        subtitle={`כל המשתמשים במערכת — ${battalion?.name ?? ""}`}
      />
      <SettingsTabs active="all-users" />

      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 mb-4">
        💡 מסך זה מציג את <b>כל המשתמשים במערכת</b> — מפ״מ, קציני מחסן, רס״פים, צופים.
        ניתן לערוך הרשאות, לשייך מחלקות, לשלוח הזמנות, להשבית/להפעיל.
      </div>

      <AllUsersTable
        baseUrl={baseUrl}
        initialQ={q}
        initialRole={role}
        initialStatus={status}
        holders={holders.map((h) => ({ id: h.id, name: h.name, kind: h.kind }))}
        squads={squads.map((s) => ({ id: s.id, name: s.name, companyId: s.company.id, companyName: s.company.name }))}
        customRoles={customRoles.map((r) => ({ id: r.id, name: r.name, template: r.template }))}
        systemRoles={systemRoles.map((r) => ({ id: r.id, name: r.name }))}
        brigade={battalion?.brigade ?? ""}
        battalionCode={battalion?.code ?? ""}
        users={users.map((u) => ({
          id: u.id,
          fullName: u.fullName,
          username: u.username,
          phone: u.phone,
          title: u.title,
          role: u.role,
          customRoleId: u.customRole?.id ?? null,
          systemRoleId: u.systemRole?.id ?? null,
          roleLabel: u.systemRole?.name ?? u.customRole?.name ?? ROLE_LABELS[u.role],
          holderId: u.holderId,
          holderName: u.holder?.name ?? null,
          holderKind: u.holder?.kind ?? null,
          holderIds: u.assignedHolders.map((h) => h.holder.id),
          extraHolders: u.assignedHolders.map((h) => h.holder.name).filter((n) => n !== u.holder?.name),
          squadIds: u.assignedSquads.map((s) => s.squadId),
          soldierFullName: u.soldier?.fullName ?? null,
          soldierPN: u.soldier?.personalNumber ?? null,
          active: u.active,
          passwordSet: u.passwordSet,
          inviteToken: u.inviteToken,
          createdAt: u.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
