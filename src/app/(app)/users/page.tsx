import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import UsersManager from "./UsersManager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const admin = await requireCapability("users.manage");
  const bId = admin.battalionId!;

  const [users, holders] = await Promise.all([
    prisma.appUser.findMany({
      where: { battalionId: bId, role: { in: ["WAREHOUSE_MANAGER", "COMPANY_REP", "VIEWER"] } },
      orderBy: { createdAt: "asc" },
      include: { holder: true },
    }),
    prisma.holder.findMany({ where: { battalionId: bId, active: true }, orderBy: { name: "asc" } }),
  ]);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  return (
    <div>
      <PageHeader title="ניהול משתמשים" subtitle="הזמנה בקישור — המשתמש מגדיר סיסמה בכניסה ראשונה" />
      <UsersManager
        baseUrl={baseUrl}
        holders={holders.map((h) => ({ id: h.id, name: h.name, kind: h.kind }))}
        users={users.map((u) => ({
          id: u.id, fullName: u.fullName, username: u.username, phone: u.phone,
          role: u.role, holderId: u.holderId, holderName: u.holder?.name ?? null,
          active: u.active, passwordSet: u.passwordSet, inviteToken: u.inviteToken,
        }))}
      />
    </div>
  );
}
