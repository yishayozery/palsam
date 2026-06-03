import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card, Table, Th, Td, EmptyState } from "@/components/ui";
import { DISCREPANCY_KIND } from "@/lib/labels";
import ResolveGap from "./ResolveGap";

export const dynamic = "force-dynamic";

export default async function GapsPage() {
  const user = await requireUser();
  const canResolve = can(user.role, "gaps.resolve");

  const [open, resolved] = await Promise.all([
    prisma.discrepancy.findMany({
      where: { status: "OPEN" },
      include: { itemType: true, holder: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.discrepancy.findMany({
      where: { status: "RESOLVED" },
      include: { itemType: true, holder: true, resolvedBy: true },
      orderBy: { resolvedAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="ניהול פערים"
        subtitle="חוסרים וחריגות מספירות — מחייבים אישור מנהל המערכת לסגירה"
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <div className="text-sm text-slate-500">פערים פתוחים</div>
          <div className="text-3xl font-bold text-rose-600 mt-1">{open.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-slate-500">חוסרים / אובדן</div>
          <div className="text-3xl font-bold text-amber-600 mt-1">
            {open.filter((d) => d.kind === "LOSS").length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-slate-500">עודפים</div>
          <div className="text-3xl font-bold text-blue-600 mt-1">
            {open.filter((d) => d.kind === "SURPLUS").length}
          </div>
        </Card>
      </div>

      <h2 className="font-bold text-slate-700 mb-2">פערים פתוחים</h2>
      <Card className="mb-6">
        {open.length === 0 ? (
          <EmptyState>אין פערים פתוחים — אמינות מלאי מלאה ✓</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>פריט</Th><Th>מחזיק</Th><Th>סוג</Th><Th>צפוי</Th><Th>נספר</Th><Th>פער</Th><Th>טיפול</Th></tr>
            </thead>
            <tbody>
              {open.map((d) => (
                <tr key={d.id}>
                  <Td className="font-medium">{d.itemType.name}</Td>
                  <Td>{d.holder?.name ?? "—"}</Td>
                  <Td>
                    <Badge className={d.kind === "LOSS" ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700"}>
                      {DISCREPANCY_KIND[d.kind]}
                    </Badge>
                  </Td>
                  <Td className="text-center">{d.expectedQty}</Td>
                  <Td className="text-center">{d.countedQty}</Td>
                  <Td className={`text-center font-bold ${d.diff < 0 ? "text-rose-600" : "text-blue-600"}`}>
                    {d.diff > 0 ? `+${d.diff}` : d.diff}
                  </Td>
                  <Td>{canResolve ? <ResolveGap id={d.id} /> : <span className="text-xs text-slate-400">ממתין ל-Admin</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {resolved.length > 0 && (
        <>
          <h2 className="font-bold text-slate-700 mb-2">פערים שנסגרו</h2>
          <Card>
            <Table>
              <thead>
                <tr><Th>פריט</Th><Th>מחזיק</Th><Th>פער</Th><Th>החלטה</Th><Th>אושר ע״י</Th></tr>
              </thead>
              <tbody>
                {resolved.map((d) => (
                  <tr key={d.id}>
                    <Td className="font-medium">{d.itemType.name}</Td>
                    <Td>{d.holder?.name ?? "—"}</Td>
                    <Td className="text-center">{d.diff > 0 ? `+${d.diff}` : d.diff}</Td>
                    <Td className="text-slate-600">{d.resolution}</Td>
                    <Td className="text-xs text-slate-500">{d.resolvedBy?.fullName}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
