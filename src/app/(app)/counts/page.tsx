import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card, Table, Th, Td, EmptyState } from "@/components/ui";
import { COUNT_TYPE, COUNT_STATUS } from "@/lib/labels";
import CrudSection from "@/components/CrudSection";
import StartCount from "./StartCount";
import {
  saveCountDefinition,
  deleteCountDefinition,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function CountsPage() {
  const user = await requireUser();
  const canManage = can(user.role, "counts.manage");
  const canExecute = can(user.role, "counts.execute");

  const [definitions, sessions, frequencies, holders] = await Promise.all([
    prisma.countDefinition.findMany({
      where: { active: true },
      include: { frequency: true, scopeHolder: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.countSession.findMany({
      orderBy: { startedAt: "desc" },
      take: 15,
      include: {
        startedBy: true,
        _count: { select: { lines: true, discrepancies: true } },
      },
    }),
    prisma.countFrequency.findMany({ where: { active: true } }),
    prisma.holder.findMany({ where: { active: true, type: { in: ["COMPANY", "ARMORY"] } } }),
  ]);

  return (
    <div>
      <PageHeader
        title="ספירות מלאי"
        subtitle="מנוע ספירה דינמי — מחסן / פלוגתי / רוחבי (הקפאת מצב)"
        action={canExecute ? <StartCount holders={holders.map((h) => ({ id: h.id, name: h.name }))} definitions={definitions.map((d) => ({ id: d.id, name: d.name, type: d.type, scopeHolderId: d.scopeHolderId }))} /> : undefined}
      />

      {canManage && (
        <div className="mb-6">
          <CrudSection
            title="הגדרות ספירה"
            addLabel="הגדרה"
            fields={[
              { name: "name", label: "שם" },
              {
                name: "type", label: "סוג", type: "select", default: "WAREHOUSE",
                options: [
                  { value: "WAREHOUSE", label: "מחסן בלבד" },
                  { value: "COMPANY", label: "פלוגתית" },
                  { value: "GLOBAL", label: "רוחבית" },
                ],
              },
              {
                name: "frequencyId", label: "תדירות", type: "select",
                options: [{ value: "", label: "—" }, ...frequencies.map((f) => ({ value: f.id, label: f.name }))],
              },
              {
                name: "scopeHolderId", label: "מיקוד (אופציונלי)", type: "select",
                options: [{ value: "", label: "כללי" }, ...holders.map((h) => ({ value: h.id, label: h.name }))],
              },
            ]}
            saveAction={saveCountDefinition}
            deleteAction={deleteCountDefinition}
            rows={definitions.map((d) => ({
              id: d.id,
              values: { name: d.name, type: d.type, frequencyId: d.frequencyId ?? "", scopeHolderId: d.scopeHolderId ?? "" },
              display: (
                <span className="flex items-center gap-1.5">
                  {d.name}
                  <Badge>{COUNT_TYPE[d.type]}</Badge>
                  {d.frequency && <Badge className="bg-slate-100 text-slate-600">{d.frequency.name}</Badge>}
                  {d.scopeHolder && <Badge className="bg-blue-100 text-blue-700">{d.scopeHolder.name}</Badge>}
                </span>
              ),
            }))}
          />
        </div>
      )}

      <h2 className="font-bold text-slate-700 mb-2">ספירות אחרונות</h2>
      <Card>
        {sessions.length === 0 ? (
          <EmptyState>טרם בוצעו ספירות</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>תאריך</Th><Th>סוג</Th><Th>סטטוס</Th><Th>שורות</Th><Th>פערים</Th><Th>בוצע ע״י</Th><Th></Th></tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <Td className="text-xs text-slate-500">{s.startedAt.toLocaleDateString("he-IL")}</Td>
                  <Td><Badge>{COUNT_TYPE[s.type]}</Badge></Td>
                  <Td>
                    <Badge className={s.status === "COMPLETED" ? "bg-slate-200 text-slate-700" : "bg-amber-100 text-amber-800"}>
                      {COUNT_STATUS[s.status]}
                    </Badge>
                  </Td>
                  <Td className="text-center">{s._count.lines}</Td>
                  <Td className="text-center">
                    {s._count.discrepancies > 0
                      ? <span className="text-rose-600 font-bold">{s._count.discrepancies}</span>
                      : "—"}
                  </Td>
                  <Td className="text-xs text-slate-500">{s.startedBy.fullName}</Td>
                  <Td>
                    {s.status !== "COMPLETED" && (
                      <Link href={`/counts/${s.id}`} className="text-xs text-blue-600 hover:underline">המשך ספירה</Link>
                    )}
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
