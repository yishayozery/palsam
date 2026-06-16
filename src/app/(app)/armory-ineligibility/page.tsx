import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import IneligibilityTable from "./IneligibilityTable";

export const dynamic = "force-dynamic";

export default async function IneligibilityReportPage() {
  const user = await requireCapability("weapons.view");
  const bId = user.battalionId!;

  const soldiers = await prisma.soldier.findMany({
    where: { battalionId: bId, active: true },
    include: { company: { select: { name: true } } },
    orderBy: [{ company: { name: "asc" } }, { fullName: "asc" }],
  });
  const battalion = await prisma.battalion.findUnique({ where: { id: bId }, select: { armoryTestUrl: true } });

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
      phone: s.phone,
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
        title="📊 דוח תהליך זכאות לנשק"
        subtitle="מצב כל החיילים בגדוד מול 4 השלבים. עוזר לדעת מי לא יחתום על נשק וצריך טיפול."
      />

      <Card className="p-4 mb-4 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-48">
            <div className="font-bold text-blue-900 text-sm mb-1">📲 שלח לחיילים</div>
            <p className="text-xs text-blue-800">שתף את הלינק הזה כדי שחיילים יוכלו לעשות את המבחן ולהעלות צילום מסך:</p>
            <div className="mt-2 bg-white border border-blue-300 rounded-lg px-3 py-2 font-mono text-xs text-blue-900 select-all break-all">
              https://palsam.vercel.app/my-equipment
            </div>
            <p className="text-[10px] text-blue-600 mt-1">💡 החייל מזדהה עם שם מלא + מ.א. — לא צריך לוגין.</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent("https://palsam.vercel.app/my-equipment")}`}
            alt="QR code" width={120} height={120} className="rounded-lg border border-blue-300 bg-white p-1"
          />
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="p-3">
          <div className="text-xs text-slate-500">סה"כ חיילים</div>
          <div className="text-2xl font-bold">{totalSoldiers}</div>
        </Card>
        <Card className="p-3 bg-emerald-50 border-emerald-200">
          <div className="text-xs text-emerald-700">זכאים לנשק</div>
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

      <IneligibilityTable rows={rows} armoryTestUrl={battalion?.armoryTestUrl ?? null} />
    </div>
  );
}
