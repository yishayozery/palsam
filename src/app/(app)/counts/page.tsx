import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card, Table, Th, Td, EmptyState } from "@/components/ui";
import { COUNT_TYPE, COUNT_STATUS } from "@/lib/labels";
import CountPlanForm from "./plans/CountPlanForm";
import MyCountTasks from "./MyCountTasks";
import {
  cancelCountSession,
  purgeAllCountTasksForm,
  deleteCountSessionForm,
} from "./actions";
import ConfirmForm from "./ConfirmForm";
import { generatePendingTasks } from "@/lib/countScheduler";
import { buildHolderItemTypes } from "@/lib/holderItemTypes";

export const dynamic = "force-dynamic";

export default async function CountsPage() {
  const user = await requireUser();
  const bId = user.battalionId!;
  const canManage = can(user, "counts.manage");
  const canExecute = can(user, "counts.execute");
  const isMafam = user.isAdmin;

  // best-effort: יצירת משימות שטרם נוצרו (בכל כניסה למסך)
  try { await generatePendingTasks(); } catch { /* ignore */ }

  // המשימות "שלי" — של המשתמש הזה לפי תפקיד
  const myTasks = await prisma.countTask.findMany({
    where: {
      battalionId: bId,
      status: { in: ["PENDING", "IN_PROGRESS", "OVERDUE"] },
      ...(isMafam ? {} : { OR: [
        { assignedUserId: user.id },
        ...(user.holderIds && user.holderIds.length > 0 ? [{ holderId: { in: user.holderIds } }] : []),
      ] }),
    },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
    take: 30,
    include: { holder: true, plan: true, assignedUser: { select: { fullName: true } } },
  });

  // בדיקת אחסון תמונות אימות
  const verificationPhotos = await prisma.verificationItem.findMany({
    where: { request: { battalionId: bId }, photoData: { not: null } },
    select: {
      photoData: true,
      request: { select: { sessionId: true, session: { select: { completedAt: true, startedAt: true } } } },
    },
  });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  let storageMB = 0;
  let oldPhotos = 0;
  for (const item of verificationPhotos) {
    const size = item.photoData ? item.photoData.length : 0;
    storageMB += size;
    if (item.request.session.completedAt && item.request.session.completedAt < thirtyDaysAgo) {
      oldPhotos++;
    }
  }
  storageMB = Math.round(storageMB / 1024 / 1024 * 10) / 10;

  // סקופ מחזיקים לפי תפקיד
  const isWM = user.role === "WAREHOUSE_MANAGER" && user.holderIds && user.holderIds.length > 0;
  const isCR = user.role === "COMPANY_REP" && !!user.holderId;
  const myHolderIds = isWM ? user.holderIds : isCR ? [user.holderId!] : [];
  const holderScope = (isWM || isCR) ? { id: { in: myHolderIds } } : {};

  // 🔒 סקופ קטגוריות/פריטים בטופס — רק מה ששייך למשתמש (הקשר"ג לא רואה מוצרים זרים):
  //  • קשר"ג: לפי סוג המחסן שלו · רס"פ: רק פריטים שהפלוגה מחזיקה · מפ"מ: הכל
  const myWhTypes = isWM
    ? (await prisma.holder.findMany({ where: { id: { in: user.holderIds } }, select: { warehouseType: true } }))
        .map((h) => h.warehouseType).filter((t): t is NonNullable<typeof t> => !!t)
    : [];
  let crItemTypeIds: string[] = [];
  if (isCR) {
    const [su, sb] = await Promise.all([
      prisma.serialUnit.findMany({ where: { battalionId: bId, dischargedAt: null, OR: [{ currentHolderId: user.holderId! }, { signedSoldier: { is: { companyId: user.holderId! } } }] }, select: { itemTypeId: true }, distinct: ["itemTypeId"] }),
      prisma.stockBalance.findMany({ where: { battalionId: bId, holderId: user.holderId!, quantity: { gt: 0 } }, select: { itemTypeId: true }, distinct: ["itemTypeId"] }),
    ]);
    crItemTypeIds = [...new Set([...su.map((x) => x.itemTypeId), ...sb.map((x) => x.itemTypeId)])];
  }
  const categoryWhere = isWM ? { battalionId: bId, warehouseType: { in: myWhTypes } }
    : isCR ? { battalionId: bId, itemTypes: { some: { id: { in: crItemTypeIds } } } }
    : { battalionId: bId };
  const itemWhere = isWM ? { battalionId: bId, active: true, category: { warehouseType: { in: myWhTypes } } }
    : isCR ? { battalionId: bId, active: true, id: { in: crItemTypeIds } }
    : { battalionId: bId, active: true };

  const [sessions, holders, categories, itemTypes, battalionUsers] = await Promise.all([
    prisma.countSession.findMany({
      where: { battalionId: bId },
      orderBy: { startedAt: "desc" },
      take: 40,
      include: {
        startedBy: { select: { id: true, fullName: true } },
        lines: { select: { countedQty: true } },
        task: { select: { dueAt: true, plan: { select: { name: true, createdById: true, responsibleUserId: true } } } },
        _count: { select: { lines: true, discrepancies: true } },
      },
    }),
    prisma.holder.findMany({
      where: { battalionId: bId, active: true, kind: { in: ["WAREHOUSE", "COMPANY"] }, ...holderScope },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true, warehouseType: true },
    }),
    prisma.category.findMany({
      where: categoryWhere,
      orderBy: { name: "asc" },
      select: { id: true, name: true, warehouseType: true },
    }),
    prisma.itemType.findMany({
      where: itemWhere,
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, categoryId: true },
    }),
    prisma.appUser.findMany({
      // אחראי ספירה — רק אנשי המקים (פלוגה/מחסן שלו) או הוא עצמו; מפ"מ רואה הכל
      where: {
        battalionId: bId, active: true,
        ...(isWM ? { OR: [{ id: user.id }, { holderId: { in: user.holderIds } }] }
          : isCR ? { OR: [{ id: user.id }, { holderId: user.holderId }, { soldier: { is: { companyId: user.holderId } } }] }
          : {}),
      },
      select: { id: true, fullName: true, role: true, holder: { select: { name: true } } },
      orderBy: { fullName: "asc" },
    }),
  ]);

  // פיצול: "הספירות שלי" (שיזמתי/אני אחראי) מול שאר הספירות בגדוד
  const sessionRows = sessions.map((s) => ({
    id: s.id, type: s.type, status: s.status,
    startedAt: s.startedAt,
    planName: s.task?.plan?.name ?? null,
    dueAt: s.task?.dueAt ?? null,
    startedByName: s.startedBy.fullName,
    total: s._count.lines,
    done: s.lines.filter((l) => l.countedQty !== null).length,
    gaps: s._count.discrepancies,
    mine: s.startedBy.id === user.id || s.task?.plan?.createdById === user.id || s.task?.plan?.responsibleUserId === user.id,
  }));
  const myCounts = sessionRows.filter((r) => r.mine);
  const otherCounts = sessionRows.filter((r) => !r.mine);

  // מפת "מה קיים בכל מחזיק" — לסינון data-driven של הקטגוריות/פריטים בטופס
  const holderItemTypes = await buildHolderItemTypes(bId, holders);

  return (
    <div>
      <PageHeader
        helpKey="counts"
        title="ספירות מלאי"
        subtitle="המשימות שלך + תכניות המפ״מ + ביצוע ספירה ידנית"
        action={
          <div className="flex gap-2 flex-wrap">
            {canManage && (
              <Link href="/counts/plans"
                className="bg-white border border-slate-300 text-slate-700 rounded-lg px-4 py-2 text-sm hover:bg-slate-50">
                📋 תכניות ספירה
              </Link>
            )}
            {canManage && (
              <Link href="/counts/report"
                className="bg-white border border-slate-300 text-slate-700 rounded-lg px-4 py-2 text-sm hover:bg-slate-50">
                📊 דוח פיזור ציוד
              </Link>
            )}
            {canManage && (
              <ConfirmForm action={purgeAllCountTasksForm}
                hiddenFields={{ confirm: "DELETE-ALL" }}
                message="למחוק את כל משימות הספירה? פעולה זו אינה משפיעה על תכניות, היסטוריה או ספירות שכבר בוצעו.">
                <button title="ניקוי כל המשימות" className="order-last text-rose-400 hover:text-rose-600 text-xs px-1.5 py-1">
                  🗑️
                </button>
              </ConfirmForm>
            )}
            {canExecute && (
              <CountPlanForm
                holders={holders.map((h) => ({ id: h.id, name: h.name, kind: h.kind, warehouseType: h.warehouseType }))}
                categories={categories}
                items={itemTypes.map((i) => ({ id: i.id, name: i.name, sku: i.sku, categoryId: i.categoryId }))}
                holderItemTypes={holderItemTypes}
                users={battalionUsers
                  .filter((u) => ["BATTALION_ADMIN", "WAREHOUSE_MANAGER", "COMPANY_REP"].includes(u.role))
                  .map((u) => ({ id: u.id, name: u.fullName, role: u.role, holderName: u.holder?.name ?? null }))}
              />
            )}
          </div>
        }
      />

      {/* התראת אחסון תמונות אימות */}
      {canManage && (storageMB > 50 || oldPhotos > 0) && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between text-sm">
          <div>
            <span className="font-medium text-amber-800">📦 אחסון תמונות אימות: {storageMB} MB</span>
            {oldPhotos > 0 && (
              <span className="text-amber-600 mr-2"> · {oldPhotos} תמונות מספירות ישנות (מעל 30 יום)</span>
            )}
          </div>
          <span className="text-xs text-amber-500">ניתן למחוק נתוני אימות ממסך הספירה</span>
        </div>
      )}

      {/* המשימות שלי */}
      {myTasks.length > 0 && (
        <MyCountTasks
          canManage={canManage}
          users={battalionUsers.map((u) => ({ id: u.id, name: u.fullName }))}
          tasks={myTasks.map((t) => ({
            id: t.id,
            shareToken: t.shareToken,
            holderName: t.holder.name,
            planName: t.plan?.name ?? "ספירה ידנית",
            status: t.status,
            scheduledAt: t.scheduledAt.toISOString(),
            dueAt: t.dueAt.toISOString(),
            assignedUserName: t.assignedUser?.fullName ?? null,
            assignedUserId: t.assignedUserId,
            sessionId: t.sessionId,
          }))}
        />
      )}

      {/* 📋 הספירות שלי — שיזמת או שאתה אחראי עליהן */}
      <div className="flex items-center gap-2 mb-2">
        <h2 className="font-bold text-slate-700">📋 הספירות שלי</h2>
        <span className="text-xs text-slate-400">(שיזמת / אחראי עליהן — לחץ לדוח מלא)</span>
      </div>
      <Card className="mb-6">
        {myCounts.length === 0 ? (
          <EmptyState>לא יזמת ספירות</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>תאריך / שם</Th><Th>סוג</Th><Th>סטטוס</Th><Th>בוצע</Th><Th>פערים</Th><Th>יעד לסיום</Th><Th></Th></tr>
            </thead>
            <tbody>
              {myCounts.map((s) => (
                <tr key={s.id}>
                  <Td className="text-xs">
                    <div className="text-slate-500">{s.startedAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}</div>
                    {s.planName && <div className="font-medium text-slate-700">{s.planName}</div>}
                  </Td>
                  <Td><Badge>{COUNT_TYPE[s.type]}</Badge></Td>
                  <Td><Badge className={s.status === "COMPLETED" ? "bg-slate-200 text-slate-700" : "bg-amber-100 text-amber-800"}>{COUNT_STATUS[s.status]}</Badge></Td>
                  <Td className="text-center text-xs">{s.done}/{s.total}</Td>
                  <Td className="text-center">{s.gaps > 0 ? <span className="text-rose-600 font-bold">{s.gaps}</span> : "—"}</Td>
                  <Td className="text-xs text-slate-500 whitespace-nowrap">{s.dueAt ? s.dueAt.toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" }) : "—"}</Td>
                  <Td>
                    <div className="flex items-center gap-2 flex-wrap">
                      {s.status === "COMPLETED"
                        ? <Link href={`/counts/${s.id}/report`} className="text-xs text-blue-600 hover:underline font-medium">📊 דוח</Link>
                        : <Link href={`/counts/${s.id}`} className="text-xs text-blue-600 hover:underline">המשך</Link>}
                      {canManage && s.status !== "COMPLETED" && (
                        <form action={cancelCountSession}><input type="hidden" name="id" value={s.id} /><button className="text-xs text-rose-500 hover:text-rose-700" title="ביטול ספירה">✕</button></form>
                      )}
                      {canManage && (
                        <ConfirmForm action={deleteCountSessionForm} hiddenFields={{ id: s.id }} message={`למחוק לצמיתות ספירה זו? כולל ${s.total} שורות ו-${s.gaps} פערים.`}>
                          <button className="text-xs text-rose-500 hover:text-rose-700" title="מחיקה לצמיתות">🗑️</button>
                        </ConfirmForm>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* ספירות אחרות בגדוד — למנהלים בלבד */}
      {canManage && otherCounts.length > 0 && (
        <>
          <h2 className="font-bold text-slate-700 mb-2">ספירות אחרות בגדוד</h2>
          <Card>
            <Table>
              <thead>
                <tr><Th>תאריך / שם</Th><Th>סוג</Th><Th>סטטוס</Th><Th>בוצע</Th><Th>פערים</Th><Th>בוצע ע״י</Th><Th></Th></tr>
              </thead>
              <tbody>
                {otherCounts.map((s) => (
                  <tr key={s.id}>
                    <Td className="text-xs">
                      <div className="text-slate-500">{s.startedAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}</div>
                      {s.planName && <div className="font-medium text-slate-700">{s.planName}</div>}
                    </Td>
                    <Td><Badge>{COUNT_TYPE[s.type]}</Badge></Td>
                    <Td><Badge className={s.status === "COMPLETED" ? "bg-slate-200 text-slate-700" : "bg-amber-100 text-amber-800"}>{COUNT_STATUS[s.status]}</Badge></Td>
                    <Td className="text-center text-xs">{s.done}/{s.total}</Td>
                    <Td className="text-center">{s.gaps > 0 ? <span className="text-rose-600 font-bold">{s.gaps}</span> : "—"}</Td>
                    <Td className="text-xs text-slate-500">{s.startedByName}</Td>
                    <Td>
                      <div className="flex items-center gap-2 flex-wrap">
                        {s.status === "COMPLETED"
                          ? <Link href={`/counts/${s.id}/report`} className="text-xs text-blue-600 hover:underline">📊 דוח</Link>
                          : <Link href={`/counts/${s.id}`} className="text-xs text-blue-600 hover:underline">המשך</Link>}
                        <ConfirmForm action={deleteCountSessionForm} hiddenFields={{ id: s.id }} message={`למחוק לצמיתות ספירה זו? כולל ${s.total} שורות ו-${s.gaps} פערים.`}>
                          <button className="text-xs text-rose-500 hover:text-rose-700" title="מחיקה לצמיתות">🗑️</button>
                        </ConfirmForm>
                      </div>
                    </Td>
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
