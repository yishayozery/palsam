import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card, Table, Th, Td, EmptyState } from "@/components/ui";
import RepsManager from "./RepsManager";
import { removeRep } from "./actions";

export const dynamic = "force-dynamic";

export default async function RepsPage() {
  const user = await requireCapability("reps.manage");
  const bId = user.battalionId!;
  if (!user.holderId) {
    return (<div><PageHeader title="נציגי פלוגות" /><Card className="p-6"><p className="text-sm text-slate-400">אינך משויך למחסן.</p></Card></div>);
  }

  const [links, companies, reps, otherWarehouses] = await Promise.all([
    prisma.warehouseCompany.findMany({
      where: { warehouseId: user.holderId },
      include: { company: true, repUser: true },
    }),
    prisma.holder.findMany({ where: { battalionId: bId, kind: "COMPANY", active: true }, orderBy: { name: "asc" } }),
    prisma.appUser.findMany({ where: { battalionId: bId, role: "COMPANY_REP", active: true }, include: { holder: true } }),
    prisma.holder.findMany({ where: { battalionId: bId, kind: "WAREHOUSE", id: { not: user.holderId } }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="נציגי פלוגות"
        subtitle="הפלוגות שהמחסן עובד מולן והנציג מכל פלוגה"
        action={
          <RepsManager
            companies={companies.map((c) => ({ id: c.id, name: c.name }))}
            reps={reps.map((r) => ({ id: r.id, name: r.fullName, companyId: r.holderId }))}
            otherWarehouses={otherWarehouses.map((w) => ({ id: w.id, name: w.name }))}
          />
        }
      />
      <Card>
        {links.length === 0 ? (
          <EmptyState>טרם הוגדרו פלוגות. הוסף או העתק ממחסן אחר.</EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>פלוגה</Th><Th>נציג</Th><Th></Th></tr></thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.id}>
                  <Td className="font-medium">{l.company.name}</Td>
                  <Td>{l.repUser ? <span className="text-blue-600">{l.repUser.fullName}</span> : <Badge className="bg-amber-100 text-amber-700">לא הוגדר נציג</Badge>}</Td>
                  <Td>
                    <form action={removeRep}>
                      <input type="hidden" name="id" value={l.id} />
                      <button className="text-xs text-rose-500 hover:text-rose-700">הסרה</button>
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
