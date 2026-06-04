import { requireSuperAdmin } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card, Table, Th, Td, EmptyState } from "@/components/ui";
import InviteLink from "@/components/InviteLink";
import BattalionForm from "./BattalionForm";
import { toggleBattalion } from "./actions";

export const dynamic = "force-dynamic";

export default async function BattalionsPage() {
  await requireSuperAdmin();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  const battalions = await prisma.battalion.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { users: true, soldiers: true, itemTypes: true, holders: true } },
      users: { where: { role: "BATTALION_ADMIN" }, select: { username: true, fullName: true, phone: true, passwordSet: true, inviteToken: true } },
    },
  });

  return (
    <div>
      <PageHeader
        title="ניהול גדודים"
        subtitle="אדמין-על — הקמת גדודים ומפמ"
        action={<BattalionForm />}
      />
      <Card>
        {battalions.length === 0 ? (
          <EmptyState>אין גדודים. הקם גדוד ראשון.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>גדוד</Th><Th>קוד</Th><Th>מפמ</Th><Th>משתמשים</Th><Th>חיילים</Th><Th>מק״טים</Th><Th>סטטוס</Th><Th></Th></tr>
            </thead>
            <tbody>
              {battalions.map((b) => (
                <tr key={b.id}>
                  <Td className="font-medium">{b.name}</Td>
                  <Td className="font-mono text-xs">{b.code}</Td>
                  <Td className="text-xs">
                    {b.users.map((u) => (
                      <div key={u.username} className="flex items-center gap-2">
                        <span>{u.fullName} (@{u.username})</span>
                        {!u.passwordSet && u.inviteToken && (
                          <InviteLink token={u.inviteToken} phone={u.phone} baseUrl={baseUrl} />
                        )}
                      </div>
                    ))}
                    {b.users.length === 0 && "—"}
                  </Td>
                  <Td className="text-center">{b._count.users}</Td>
                  <Td className="text-center">{b._count.soldiers}</Td>
                  <Td className="text-center">{b._count.itemTypes}</Td>
                  <Td>{b.active ? <Badge className="bg-emerald-100 text-emerald-700">פעיל</Badge> : <Badge className="bg-rose-100 text-rose-700">מושבת</Badge>}</Td>
                  <Td>
                    <form action={toggleBattalion}>
                      <input type="hidden" name="id" value={b.id} />
                      <button className="text-xs text-slate-500 hover:text-slate-800">{b.active ? "השבתה" : "הפעלה"}</button>
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
