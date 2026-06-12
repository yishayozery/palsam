import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card, Table, Th, Td, EmptyState } from "@/components/ui";
import { TRANSFER_TYPE, TRANSFER_STATUS, TRANSFER_STATUS_COLOR } from "@/lib/labels";
import { approveTransfer, rejectTransfer } from "./actions";

export const dynamic = "force-dynamic";

export default async function TransfersPage() {
  const user = await requireUser();
  const bId = user.battalionId!;
  const canApprove = can(user.role, "transfer.approve");

  // סקופ: קצין מחסן רואה רק העברות עם המחסנים שלו; רס"פ רק העברות עם הפלוגה שלו
  const isWarehouseManager = user.role === "WAREHOUSE_MANAGER";
  const isCompanyRep = user.role === "COMPANY_REP";
  const myHolderIds = user.holderIds ?? [];
  const scopeFilter = (isWarehouseManager && myHolderIds.length > 0)
    ? { OR: [{ fromHolderId: { in: myHolderIds } }, { toHolderId: { in: myHolderIds } }] }
    : (isCompanyRep && user.holderId)
      ? { OR: [{ fromHolderId: user.holderId }, { toHolderId: user.holderId }] }
      : {};

  const transfers = await prisma.transfer.findMany({
    where: {
      battalionId: bId,
      type: { in: ["ISSUE", "RETURN", "INTAKE", "WRITE_OFF"] },
      ...scopeFilter,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      fromHolder: true,
      toHolder: true,
      createdBy: true,
      _count: { select: { lines: true } },
    },
  });

  // לחיצות יד שממתינות לאישור המשתמש הנוכחי (כיעד)
  const myPending = transfers.filter(
    (t) => t.status === "PENDING" && canApprove &&
      (user.holderId ? t.toHolderId === user.holderId : true),
  );

  return (
    <div>
      <PageHeader
        title={isCompanyRep ? "📥 קבלות הפלוגה" : "קבלות והחזרות (גדוד ↔ חטיבה)"}
        subtitle={isCompanyRep
          ? "תעודות שהמחסן שלח אליך — לחץ '✓ אישור קבלה' כדי לסגור את לחיצת היד והציוד ייכנס למלאי הפלוגה."
          : "היסטוריית קליטות מהחטיבה וזיכויים. הקצאה לפלוגה/חייל — דרך מסך 'החתמות'."}
      />

      {myPending.length > 0 && (
        <Card className="mb-6 p-4 border-amber-200 bg-amber-50">
          <h2 className="font-bold text-amber-800 mb-3">
            ⏳ ממתינים לאישור הקבלה שלך ({myPending.length})
          </h2>
          <div className="space-y-2">
            {myPending.map((t) => (
              <div key={t.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-2.5 border border-amber-200">
                <div className="text-sm">
                  <span className="font-medium">{TRANSFER_TYPE[t.type]}</span>
                  {" — "}
                  {t.fromHolder?.name} ← {t.toHolder?.name}
                  <span className="text-slate-400"> · {t._count.lines} פריטים</span>
                </div>
                <div className="flex gap-2">
                  <Link href={`/transfers/${t.id}/document`} className="text-xs text-slate-500 hover:underline self-center">תעודה</Link>
                  <form action={approveTransfer}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="bg-emerald-600 text-white rounded-lg px-3 py-1.5 text-sm hover:bg-emerald-700">
                      ✓ אישור קבלה
                    </button>
                  </form>
                  <form action={rejectTransfer}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="bg-white border border-rose-300 text-rose-600 rounded-lg px-3 py-1.5 text-sm hover:bg-rose-50">
                      דחייה
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        {transfers.length === 0 ? (
          <EmptyState>אין העברות עדיין</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>תאריך</Th><Th>סוג</Th><Th>מאת</Th><Th>אל</Th>
                <Th>פריטים</Th><Th>סטטוס</Th><Th>בוצע ע״י</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id}>
                  <Td className="text-xs text-slate-500">
                    {t.createdAt.toLocaleDateString("he-IL")}
                  </Td>
                  <Td className="font-medium">{TRANSFER_TYPE[t.type]}</Td>
                  <Td>{t.fromHolder?.name ?? "חטיבה"}</Td>
                  <Td>{t.toHolder?.name ?? "חטיבה"}</Td>
                  <Td className="text-center">{t._count.lines}</Td>
                  <Td><Badge className={TRANSFER_STATUS_COLOR[t.status]}>{TRANSFER_STATUS[t.status]}</Badge></Td>
                  <Td className="text-xs text-slate-500">{t.createdBy.fullName}</Td>
                  <Td>
                    <Link href={`/transfers/${t.id}/document`} className="text-xs text-slate-500 hover:text-slate-800">
                      תעודה
                    </Link>
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
