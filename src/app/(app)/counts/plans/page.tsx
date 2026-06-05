import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, EmptyState, Table, Th, Td } from "@/components/ui";
import { WAREHOUSE_TYPE_SHORT } from "@/lib/rbac";
import CountPlanForm from "./CountPlanForm";
import { toggleCountPlan, deleteCountPlan } from "./actions";

export const dynamic = "force-dynamic";

const DOW_LABELS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

export default async function CountPlansPage() {
  const user = await requireCapability("counts.manage");
  const bId = user.battalionId!;

  const [plans, holders, categories, items] = await Promise.all([
    prisma.countPlan.findMany({
      where: { battalionId: bId },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      include: {
        createdBy: { select: { fullName: true } },
        _count: { select: { tasks: true } },
      },
    }),
    prisma.holder.findMany({
      where: { battalionId: bId, active: true, kind: { in: ["WAREHOUSE", "COMPANY"] } },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true, warehouseType: true },
    }),
    prisma.category.findMany({ where: { battalionId: bId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.itemType.findMany({ where: { battalionId: bId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true } }),
  ]);

  return (
    <div>
      <PageHeader
        title="תכניות ספירת מלאי"
        subtitle="המפ״מ מגדיר מה לספור, איפה, מתי. המערכת מולידה משימות לאחראים בכל זמן מתוזמן."
        action={
          <CountPlanForm
            holders={holders.map((h) => ({ id: h.id, name: h.name, kind: h.kind, warehouseType: h.warehouseType }))}
            categories={categories}
            items={items.map((i) => ({ id: i.id, name: i.name, sku: i.sku }))}
          />
        }
      />

      <Card className="p-4 mb-4 bg-blue-50 border-blue-200 text-sm text-blue-900">
        💡 <b>איך זה עובד?</b> בנה תכנית פעם אחת — המערכת תייצר משימת ספירה לכל מחסן/פלוגה בהיקף בכל זמן מתוזמן.
        האחראי האוטומטי = המשתמש הראשי של המחסן/הפלוגה. הוא יכול להעביר את המשימה ב-WhatsApp עם לינק ייעודי.
      </Card>

      <Card>
        {plans.length === 0 ? (
          <EmptyState>אין תכניות ספירה. הוסף את הראשונה בכפתור למעלה.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>שם</Th><Th>היקף</Th><Th>תזמון</Th><Th>סה״כ משימות</Th><Th>סטטוס</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => {
                const scopeText = p.scopeHolderIds.length === 0
                  ? "כל המחסנים והפלוגות"
                  : `${p.scopeHolderIds.length} מחסנים/פלוגות`;
                const trackingText = p.trackingMethods.length === 0
                  ? "כל שיטות המעקב"
                  : p.trackingMethods.join(", ");
                const dowText = p.daysOfWeek.length === 0
                  ? "כל יום"
                  : p.daysOfWeek.sort().map((d) => DOW_LABELS[d]).join(",");
                const freqText = p.frequencyDays === 0 ? "חד-פעמי"
                  : p.frequencyDays === 1 ? "יומי"
                  : p.frequencyDays === 7 ? "שבועי"
                  : p.frequencyDays === 30 ? "חודשי"
                  : `כל ${p.frequencyDays} ימים`;
                return (
                  <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                    <Td>
                      <div className="font-medium">{p.name}</div>
                      {p.description && <div className="text-xs text-slate-500">{p.description}</div>}
                      <div className="text-xs text-slate-400 mt-0.5">{trackingText}</div>
                    </Td>
                    <Td className="text-xs">{scopeText}</Td>
                    <Td className="text-xs">
                      <div>{freqText} · {dowText}</div>
                      <div className="text-slate-500">
                        {p.scheduledTimes.length === 0 ? "—" : p.scheduledTimes.join(" · ")}
                      </div>
                      <div className="text-slate-400">חסד: {p.graceMinutes} דק׳</div>
                    </Td>
                    <Td className="text-center font-bold">{p._count.tasks}</Td>
                    <Td>
                      <Badge className={p.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}>
                        {p.active ? "פעיל" : "מושבת"}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <form action={toggleCountPlan}>
                          <input type="hidden" name="id" value={p.id} />
                          <button className="text-xs text-slate-500 hover:text-slate-800">{p.active ? "השבת" : "הפעל"}</button>
                        </form>
                        <form action={deleteCountPlan}>
                          <input type="hidden" name="id" value={p.id} />
                          <button className="text-xs text-rose-500 hover:text-rose-700">מחק</button>
                        </form>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
