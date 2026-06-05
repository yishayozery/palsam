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

  const battalion = await prisma.battalion.findUnique({ where: { id: bId }, select: { name: true } });

  const users = await prisma.appUser.findMany({
    where: { battalionId: bId },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: {
      holder: { select: { id: true, name: true, kind: true } },
      assignedHolders: { include: { holder: { select: { name: true } } } },
      soldier: { select: { id: true, fullName: true, personalNumber: true } },
    },
  });

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
        ניתן לראות סטטוס הזמנה, להעתיק/לשלוח קישור מחדש, להשבית/להפעיל, להזמין מחדש (יצירת קישור חדש).
      </div>

      <AllUsersTable
        baseUrl={baseUrl}
        initialQ={q}
        initialRole={role}
        initialStatus={status}
        users={users.map((u) => ({
          id: u.id,
          fullName: u.fullName,
          username: u.username,
          phone: u.phone,
          title: u.title,
          role: u.role,
          roleLabel: ROLE_LABELS[u.role],
          holderName: u.holder?.name ?? null,
          holderKind: u.holder?.kind ?? null,
          extraHolders: u.assignedHolders.map((h) => h.holder.name).filter((n) => n !== u.holder?.name),
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
