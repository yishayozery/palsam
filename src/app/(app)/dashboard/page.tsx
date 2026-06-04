import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader, StatCard, Badge } from "@/components/ui";
import { TRANSFER_TYPE } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  if (user.role === "SUPER_ADMIN") redirect("/admin/battalions");
  const bId = user.battalionId!;

  const [
    pendingTransfers,
    openGaps,
    wearUnits,
    lossUnits,
    serialTotal,
    signedSerial,
    companies,
    quantityStock,
  ] = await Promise.all([
    prisma.transfer.count({ where: { battalionId: bId, status: "PENDING" } }),
    prisma.discrepancy.count({ where: { battalionId: bId, status: "OPEN" } }),
    prisma.serialUnit.count({ where: { battalionId: bId, status: { isWear: true } } }),
    prisma.serialUnit.count({ where: { battalionId: bId, status: { isLoss: true } } }),
    prisma.serialUnit.count({ where: { battalionId: bId } }),
    prisma.serialUnit.count({ where: { battalionId: bId, signedSoldierId: { not: null } } }),
    prisma.holder.findMany({ where: { battalionId: bId, kind: "COMPANY", active: true } }),
    prisma.stockBalance.aggregate({ _sum: { quantity: true }, where: { battalionId: bId } }),
  ]);

  // תמונת מצב פלוגתית: סריאלי לכל פלוגה — מוקצה / חתום / פנוי
  const companyRows = await Promise.all(
    companies.map(async (c) => {
      const allocated = await prisma.serialUnit.count({
        where: { currentHolderId: c.id },
      });
      const signed = await prisma.serialUnit.count({
        where: { currentHolderId: c.id, signedSoldierId: { not: null } },
      });
      return { name: c.name, allocated, signed, free: allocated - signed };
    }),
  );

  // אמינות מלאי: מבוסס על פערים פתוחים מול סך פריטים סריאליים (אינדיקציה)
  const accuracy =
    serialTotal === 0
      ? 100
      : Math.max(0, Math.round((1 - openGaps / serialTotal) * 100));

  const recentTransfers = await prisma.transfer.findMany({
    where: { battalionId: bId },
    take: 6,
    orderBy: { createdAt: "desc" },
    include: { fromHolder: true, toHolder: true, toSoldier: true },
  });

  return (
    <div>
      <PageHeader
        title={`שלום, ${user.fullName}`}
        subtitle="תמונת מצב לוגיסטית בזמן אמת"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="אמינות מלאי"
          value={`${accuracy}%`}
          hint="מבוסס פערים פתוחים"
          tone={accuracy >= 95 ? "emerald" : accuracy >= 85 ? "amber" : "rose"}
        />
        <StatCard
          label="מלאי במעבר"
          value={pendingTransfers}
          hint="ממתינים לאישור קבלה"
          tone={pendingTransfers > 0 ? "amber" : "slate"}
        />
        <StatCard
          label="פערים פתוחים"
          value={openGaps}
          hint="מחייבים טיפול"
          tone={openGaps > 0 ? "rose" : "emerald"}
        />
        <StatCard
          label="פריטים בבלאי"
          value={wearUnits}
          hint={`${lossUnits} אבודים`}
          tone={wearUnits + lossUnits > 0 ? "amber" : "slate"}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="font-bold text-slate-800 mb-4">תמונת מצב פלוגתית</h2>
          {companyRows.length === 0 ? (
            <p className="text-sm text-slate-400">אין פלוגות מוגדרות</p>
          ) : (
            <table className="w-full text-sm text-right">
              <thead>
                <tr className="text-xs text-slate-500">
                  <th className="text-right pb-2">פלוגה</th>
                  <th className="pb-2">מוקצה</th>
                  <th className="pb-2">חתום על חיילים</th>
                  <th className="pb-2">פנוי בארון</th>
                </tr>
              </thead>
              <tbody>
                {companyRows.map((r) => (
                  <tr key={r.name} className="border-t border-slate-100">
                    <td className="py-2 font-medium">{r.name}</td>
                    <td className="py-2 text-center">{r.allocated}</td>
                    <td className="py-2 text-center text-blue-600">{r.signed}</td>
                    <td className="py-2 text-center text-emerald-600">{r.free}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 flex gap-4">
            <span>סה״כ פריטים סריאליים: {serialTotal}</span>
            <span>חתומים: {signedSerial}</span>
            <span>מלאי כמותי: {quantityStock._sum.quantity ?? 0}</span>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-bold text-slate-800 mb-4">פעולות אחרונות</h2>
          {recentTransfers.length === 0 ? (
            <p className="text-sm text-slate-400">אין פעולות אחרונות</p>
          ) : (
            <ul className="space-y-2">
              {recentTransfers.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between text-sm border-b border-slate-100 pb-2"
                >
                  <div>
                    <div className="font-medium">{TRANSFER_TYPE[t.type]}</div>
                    <div className="text-xs text-slate-400">
                      {t.fromHolder?.name ?? "חטיבה"} ←{" "}
                      {t.toSoldier?.fullName ?? t.toHolder?.name ?? "חטיבה"}
                    </div>
                  </div>
                  <Badge
                    className={
                      t.status === "PENDING"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-emerald-100 text-emerald-800"
                    }
                  >
                    {t.status === "PENDING" ? "ממתין" : "הושלם"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
