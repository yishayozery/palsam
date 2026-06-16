import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, Table, Th, Td, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function IneligibilityReportPage() {
  const user = await requireCapability("weapons.view");
  const bId = user.battalionId!;

  const soldiers = await prisma.soldier.findMany({
    where: { battalionId: bId, active: true },
    include: { company: { select: { name: true } } },
    orderBy: [{ company: { name: "asc" } }, { fullName: "asc" }],
  });

  const rows = soldiers.map((s) => {
    const missing: string[] = [];
    if (!s.enlisted) missing.push("שלישות");
    if (!s.weaponsApprovedAt) missing.push('מג"ד/סמג"ד');
    if (!s.armoryTestProofAt) missing.push("מבחן ארמון");
    if (!s.weaponsAgreementSignedAt) missing.push("נוהל שמירה");
    return {
      id: s.id,
      name: s.fullName,
      pn: s.personalNumber,
      company: s.company?.name ?? "—",
      enlisted: s.enlisted,
      approved: !!s.weaponsApprovedAt,
      test: !!s.armoryTestProofAt,
      agreement: !!s.weaponsAgreementSignedAt,
      missing,
      isFullyEligible: missing.length === 0,
    };
  });

  const totalSoldiers = rows.length;
  const eligible = rows.filter((r) => r.isFullyEligible).length;
  const ineligible = totalSoldiers - eligible;
  const fullyBlocked = rows.filter((r) => r.missing.length >= 3).length;

  return (
    <div>
      <PageHeader
        title="📊 דוח זכאות לחימוש"
        subtitle="מצב כל החיילים בגדוד מול 4 השלבים. עוזר לדעת מי לא יחתום על נשק וצריך טיפול."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="p-3">
          <div className="text-xs text-slate-500">סה"כ חיילים</div>
          <div className="text-2xl font-bold">{totalSoldiers}</div>
        </Card>
        <Card className="p-3 bg-emerald-50 border-emerald-200">
          <div className="text-xs text-emerald-700">זכאים לחימוש</div>
          <div className="text-2xl font-bold text-emerald-700">{eligible}</div>
        </Card>
        <Card className="p-3 bg-amber-50 border-amber-200">
          <div className="text-xs text-amber-700">חסר שלב/שניים</div>
          <div className="text-2xl font-bold text-amber-700">{ineligible - fullyBlocked}</div>
        </Card>
        <Card className="p-3 bg-rose-50 border-rose-200">
          <div className="text-xs text-rose-700">חסר 3+ שלבים</div>
          <div className="text-2xl font-bold text-rose-700">{fullyBlocked}</div>
        </Card>
      </div>

      {rows.length === 0 ? (
        <Card className="p-6"><EmptyState>אין חיילים בגדוד</EmptyState></Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>חייל</Th><Th>פלוגה</Th>
                <Th>שלישות</Th><Th>מג"ד/סמג"ד</Th><Th>מבחן ארמון</Th><Th>נוהל שמירה</Th>
                <Th>סטטוס</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.isFullyEligible ? "" : "bg-rose-50/30"}>
                  <Td>
                    <div className="font-medium">{r.name}</div>
                    {r.pn && <div className="text-[11px] text-slate-500 font-mono">{r.pn}</div>}
                  </Td>
                  <Td className="text-xs">{r.company}</Td>
                  <Td>{r.enlisted ? "✅" : "❌"}</Td>
                  <Td>{r.approved ? "✅" : "❌"}</Td>
                  <Td>{r.test ? "✅" : "❌"}</Td>
                  <Td>{r.agreement ? "✅" : "❌"}</Td>
                  <Td>
                    {r.isFullyEligible ? (
                      <Badge className="bg-emerald-100 text-emerald-700">✓ זכאי</Badge>
                    ) : (
                      <Badge className="bg-rose-100 text-rose-700">חסר: {r.missing.join(", ")}</Badge>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
