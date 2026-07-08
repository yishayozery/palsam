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

  // סקופ: קצין מחסן רואה רק תכניות שלו/לגבי מחסניו; רס"פ רק לגבי הפלוגה שלו; מפ"מ רואה הכל
  const isWM = user.role === "WAREHOUSE_MANAGER" && user.holderIds.length > 0;
  const isCR = user.role === "COMPANY_REP" && !!user.holderId;
  const myHolderIds = isWM ? user.holderIds : isCR ? [user.holderId!] : [];
  const planScope = (isWM || isCR)
    ? { OR: [
        { createdById: user.id },
        { scopeHolderIds: { hasSome: myHolderIds } },
      ] }
    : {};
  const holderScope = (isWM || isCR)
    ? { id: { in: myHolderIds } }
    : {};

  const [plans, holders, categories, items, eligibleUsers] = await Promise.all([
    prisma.countPlan.findMany({
      where: { battalionId: bId, ...planScope },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      include: {
        createdBy: { select: { fullName: true } },
        responsibleUser: { select: { fullName: true } },
        // טוענים את כל המשימות + holder לחישוב סטטוס וניםוח מי מאחר
        tasks: {
          include: {
            holder: { select: { name: true, kind: true } },
            assignedUser: { select: { fullName: true } },
          },
          orderBy: [{ status: "asc" }, { dueAt: "asc" }],
        },
      },
    }),
    prisma.holder.findMany({
      where: { battalionId: bId, active: true, kind: { in: ["WAREHOUSE", "COMPANY"] }, ...holderScope },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true, warehouseType: true },
    }),
    prisma.category.findMany({ where: { battalionId: bId }, orderBy: { name: "asc" }, select: { id: true, name: true, warehouseType: true } }),
    prisma.itemType.findMany({ where: { battalionId: bId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true, categoryId: true } }),
    // אחראים אפשריים: כל קציני המחסן, רס"פ פלוגה ומפ"מ
    prisma.appUser.findMany({
      where: { battalionId: bId, active: true, role: { in: ["BATTALION_ADMIN", "WAREHOUSE_MANAGER", "COMPANY_REP"] } },
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
      select: { id: true, fullName: true, role: true, holder: { select: { name: true } } },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="תכניות ספירת מלאי"
        subtitle={isCR
          ? "צור תכנית לספירת הפלוגה / המחסנים שמספקים אותך — המערכת תייצר משימות לאחראים."
          : isWM
            ? "צור תכנית לספירת המחסנים שלך — המערכת תייצר משימות לאחראים."
            : "המפ״מ מגדיר מה לספור, איפה, מתי. המערכת מולידה משימות לאחראים בכל זמן מתוזמן."}
        action={
          <CountPlanForm
            holders={holders.map((h) => ({ id: h.id, name: h.name, kind: h.kind, warehouseType: h.warehouseType }))}
            categories={categories}
            items={items.map((i) => ({ id: i.id, name: i.name, sku: i.sku, categoryId: i.categoryId }))}
            users={eligibleUsers.map((u) => ({ id: u.id, name: u.fullName, role: u.role, holderName: u.holder?.name ?? null }))}
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
                <Th>שם</Th><Th>אחראי</Th><Th>תזמון</Th><Th>התקדמות (משימות)</Th><Th>מאחרים</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => {
                const dowText = p.daysOfWeek.length === 0
                  ? "כל יום"
                  : p.daysOfWeek.sort().map((d) => DOW_LABELS[d]).join(",");
                const freqText = p.frequencyDays === 0 ? "חד-פעמי"
                  : p.frequencyDays === 1 ? "יומי"
                  : p.frequencyDays === 7 ? "שבועי"
                  : p.frequencyDays === 30 ? "חודשי"
                  : `כל ${p.frequencyDays} ימים`;
                // סטטיסטיקות משימות
                const total = p.tasks.length;
                const completed = p.tasks.filter((t) => t.status === "COMPLETED").length;
                const inProgress = p.tasks.filter((t) => t.status === "IN_PROGRESS").length;
                const pending = p.tasks.filter((t) => t.status === "PENDING").length;
                const overdueTasks = p.tasks.filter((t) => t.status === "OVERDUE");
                const overdue = overdueTasks.length;
                const completedPct = total > 0 ? Math.round((completed / total) * 100) : 0;
                return (
                  <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                    <Td>
                      <div className="font-medium">{p.name}</div>
                      {p.description && <div className="text-xs text-slate-500">{p.description}</div>}
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {p.scopeHolderIds.length === 0 ? "כל המחסנים+פלוגות" : `${p.scopeHolderIds.length} מחזיקים`}
                        {p.trackingMethods.length > 0 && ` · ${p.trackingMethods.join(",")}`}
                      </div>
                    </Td>
                    <Td className="text-xs">
                      {p.responsibleUser?.fullName ?? p.createdBy.fullName}
                      {!p.active && <Badge className="bg-slate-100 text-slate-500 text-[9px] mr-1">מושבת</Badge>}
                    </Td>
                    <Td className="text-xs">
                      <div>{freqText} · {dowText}</div>
                      <div className="text-slate-500">
                        {p.scheduledTimes.length === 0 ? "—" : p.scheduledTimes.join(" · ")}
                      </div>
                      <div className="text-slate-400">חסד: {p.graceMinutes} דק׳</div>
                    </Td>
                    {/* התקדמות עם פסים צבעוניים */}
                    <Td>
                      {total === 0 ? (
                        <span className="text-xs text-slate-400">טרם נוצרו משימות</span>
                      ) : (
                        <div className="space-y-1.5 min-w-40">
                          <div className="text-xs font-bold flex items-center gap-2">
                            <span className="text-emerald-700">{completed}</span>
                            <span className="text-slate-400">/</span>
                            <span>{total}</span>
                            <span className="text-slate-500 text-[10px]">({completedPct}%)</span>
                          </div>
                          {/* פס התקדמות */}
                          <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-200">
                            {completed > 0 && <div className="bg-emerald-500" style={{ width: `${(completed / total) * 100}%` }} />}
                            {inProgress > 0 && <div className="bg-amber-400" style={{ width: `${(inProgress / total) * 100}%` }} />}
                            {pending > 0 && <div className="bg-blue-400" style={{ width: `${(pending / total) * 100}%` }} />}
                            {overdue > 0 && <div className="bg-rose-600" style={{ width: `${(overdue / total) * 100}%` }} />}
                          </div>
                          <div className="text-[10px] text-slate-500 flex gap-2 flex-wrap">
                            {completed > 0 && <span className="text-emerald-700">✓ {completed}</span>}
                            {inProgress > 0 && <span className="text-amber-700">⏳ {inProgress}</span>}
                            {pending > 0 && <span className="text-blue-700">⏸ {pending}</span>}
                            {overdue > 0 && <span className="text-rose-700">⏰ {overdue}</span>}
                          </div>
                        </div>
                      )}
                    </Td>
                    {/* רשימת מי מאחר */}
                    <Td className="text-xs">
                      {overdue === 0 ? (
                        <span className="text-emerald-600">✓ בזמן</span>
                      ) : (
                        <div className="space-y-0.5">
                          {overdueTasks.slice(0, 3).map((t) => {
                            const lateMin = Math.round((Date.now() - t.dueAt.getTime()) / 60000);
                            const lateText = lateMin < 60 ? `${lateMin} דק׳` : lateMin < 1440 ? `${Math.floor(lateMin / 60)} שע׳` : `${Math.floor(lateMin / 1440)} ימים`;
                            return (
                              <div key={t.id} className="bg-rose-50 rounded px-1.5 py-0.5">
                                <div className="font-medium text-rose-900">{t.holder.kind === "COMPANY" ? "🪖" : "🏪"} {t.holder.name}</div>
                                <div className="text-[10px] text-rose-700">
                                  {t.assignedUser?.fullName ?? "לא מוקצה"} · איחור: {lateText}
                                </div>
                              </div>
                            );
                          })}
                          {overdue > 3 && (
                            <div className="text-[10px] text-rose-600">+ עוד {overdue - 3} <a href={`/counts/plans/${p.id}`} className="underline">פרטים</a></div>
                          )}
                        </div>
                      )}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2 flex-wrap">
                        <a href={`/counts/plans/${p.id}`} className="text-xs text-blue-600 hover:underline font-medium">📊 פירוט</a>
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
