import Link from "next/link";
import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import NewIntakeForm from "./NewIntakeForm";

export const dynamic = "force-dynamic";

function fmtIL(d: Date): string {
  return new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }).format(d);
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "טיוטה", cls: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "נקלט", cls: "bg-emerald-100 text-emerald-700" },
  CANCELLED: { label: "בוטל", cls: "bg-slate-100 text-slate-500" },
};

export default async function IntakeListPage() {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;

  const [drafts, warehouses] = await Promise.all([
    prisma.intakeDraft.findMany({
      where: { battalionId: bId },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true, voucherNo: true, status: true, createdAt: true,
        holder: { select: { name: true } },
        _count: { select: { lines: true } },
      },
    }),
    prisma.holder.findMany({ where: { battalionId: bId, kind: "WAREHOUSE", active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div>
      <PageHeader
        title="📄 קליטת שובר SAP"
        subtitle="קליטת מלאי משובר השאלה של החטיבה — טיוטה שמתקנים ומאשרים · המלאי זז רק באישור"
      />

      <NewIntakeForm warehouses={warehouses} />

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 my-4">
        ℹ️ הדביקו את שורות השובר (מק&quot;ט, תיאור, תקן, מלאי, פער — כל שורה בשורה נפרדת). המערכת מזהה מק&quot;ט מול הקטלוג,
        מאמתת שהחשבון <b>תקן − מלאי = פער</b> מסתדר, וחוסמת אישור עד שכל שורה תקינה. פריט חדש מוקם כ&quot;ציוד / כמותי&quot; וניתן לשנות.
      </div>

      {drafts.length === 0 ? (
        <EmptyState>עדיין אין טיוטות קליטה — צרו אחת מהטופס למעלה</EmptyState>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {drafts.map((d) => {
            const b = STATUS_BADGE[d.status] ?? STATUS_BADGE.DRAFT;
            return (
              <Link key={d.id} href={`/stock/intake/${d.id}`}>
                <Card className="p-4 hover:ring-2 hover:ring-indigo-200 transition">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-slate-800">{d.voucherNo || "שובר ללא מספר"}</div>
                    <Badge className={b.cls}>{b.label}</Badge>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {d.holder?.name} · {d._count.lines} שורות · {fmtIL(d.createdAt)}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
