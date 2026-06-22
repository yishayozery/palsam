import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { getCompanyItemTotals } from "@/lib/company-stock-snapshot";
import PermanentItemsClient from "./PermanentItemsClient";

export const dynamic = "force-dynamic";

export default async function PermanentItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const user = await requireCapability("battalion.profile");
  const bId = user.battalionId!;
  const sp = await searchParams;

  const companies = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "COMPANY", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const selectedCompanyId = sp.companyId && companies.some((c) => c.id === sp.companyId)
    ? sp.companyId
    : companies[0]?.id;

  if (!selectedCompanyId) {
    return (
      <div>
        <PageHeader title="📌 ציוד קבוע פר פלוגה" subtitle="הגדרת כמות בסיס שנשארת אצל הפלוגה גם אחרי תעסוקה" />
        <Card className="p-6"><EmptyState>אין פלוגות פעילות בגדוד.</EmptyState></Card>
      </div>
    );
  }

  // קטלוג הגדוד
  const items = await prisma.itemType.findMany({
    where: { battalionId: bId, active: true },
    orderBy: [{ name: "asc" }],
    include: { category: { select: { name: true, warehouseType: true } } },
  });

  // בסיסים קיימים
  const baselines = await prisma.companyItemBaseline.findMany({
    where: { battalionId: bId, companyId: selectedCompanyId },
    select: { itemTypeId: true, permanentQuantity: true, updatedAt: true },
  });
  const baselineMap = new Map(baselines.map((b) => [b.itemTypeId, b.permanentQuantity]));

  // כמות נוכחית פר פריט
  const totals = await getCompanyItemTotals(bId, selectedCompanyId);

  const rows = items.map((i) => ({
    id: i.id,
    name: i.name,
    sku: i.sku,
    unit: i.unit,
    trackingMethod: i.trackingMethod,
    categoryName: i.category?.name ?? null,
    categoryWarehouseType: i.category?.warehouseType ?? null,
    currentQuantity: totals.get(i.id) ?? 0,
    baseline: baselineMap.get(i.id) ?? 0,
  }));

  // סטטיסטיקה
  const itemsWithStock = rows.filter((r) => r.currentQuantity > 0).length;
  const itemsWithBaseline = rows.filter((r) => r.baseline > 0).length;
  const allRowsBaselineSum = rows.reduce((s, r) => s + r.baseline, 0);
  const allRowsCurrentSum = rows.reduce((s, r) => s + r.currentQuantity, 0);

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

  return (
    <div>
      <PageHeader
        title="📌 ציוד קבוע פר פלוגה"
        subtitle={`הגדרת כמות בסיס שנשארת אצל הפלוגה גם אחרי תעסוקה. ערוך רק מפמ. ברירת מחדל = 0 (כל הציוד חוזר).`}
      />

      <Card className="p-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm font-medium text-slate-700">פלוגה:</label>
          <form method="GET" className="flex items-center gap-2">
            <select name="companyId" defaultValue={selectedCompanyId}
              onChange={(e) => { (e.target.form as HTMLFormElement).submit(); }}
              className="rounded-lg border-2 border-slate-300 px-3 py-1.5 text-sm">
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </form>
          <div className="text-xs text-slate-500 mr-auto flex gap-4">
            <span>📦 {itemsWithStock} פריטים עם מלאי</span>
            <span>📌 {itemsWithBaseline} פריטים עם בסיס &gt; 0</span>
            <span>סך כמויות: <b className="text-blue-700">{allRowsCurrentSum}</b> נוכחי, <b className="text-emerald-700">{allRowsBaselineSum}</b> בסיס</span>
          </div>
        </div>
      </Card>

      <PermanentItemsClient
        companyId={selectedCompanyId}
        companyName={selectedCompany?.name ?? ""}
        rows={rows}
      />
    </div>
  );
}
