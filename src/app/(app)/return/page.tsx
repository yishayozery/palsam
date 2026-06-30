import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, EmptyState, Table, Th, Td } from "@/components/ui";
import { TRANSFER_STATUS, TRANSFER_STATUS_COLOR } from "@/lib/labels";
import { WAREHOUSE_TYPE_SHORT } from "@/lib/rbac";
import ReturnForm from "./ReturnForm";

export const dynamic = "force-dynamic";

export default async function ReturnPage() {
  const user = await requireCapability("company.manage");
  const bId = user.battalionId!;
  const companyId = user.holderId;
  if (!companyId) return <p className="p-6 text-rose-600">לא משויך לפלוגה — פנה למפ״מ.</p>;

  const company = await prisma.holder.findUnique({ where: { id: companyId }, select: { name: true } });

  const [serialUnits, balances, statuses, recent] = await Promise.all([
    prisma.serialUnit.findMany({
      where: {
        battalionId: bId, currentHolderId: companyId, signedSoldierId: null,
        transferLines: { none: { transfer: { status: "PENDING" } } },
      },
      include: { itemType: true, status: true },
      orderBy: { itemType: { name: "asc" } },
    }),
    prisma.stockBalance.findMany({
      where: { battalionId: bId, holderId: companyId, quantity: { gt: 0 } },
      include: { itemType: true, status: true },
      orderBy: { itemType: { name: "asc" } },
    }),
    prisma.itemStatus.findMany({ where: { battalionId: bId, active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.transfer.findMany({
      where: { battalionId: bId, type: "RETURN", fromHolderId: companyId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { toHolder: true, lines: { include: { itemType: true } }, approvedBy: true },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="זיכוי לגדוד"
        subtitle={`החזרת ציוד פלוגתי למחסן הגדודי. הבקשה תמתין לאישור קצין המחסן (לחיצת יד). פלוגה: ${company?.name ?? ""}`}
      />

      <Card className="p-5 mb-5 bg-amber-50 border-amber-200">
        <p className="text-sm text-amber-900">
          💡 <b>איך זה עובד?</b> בחר את הפריט שברצונך להחזיר, סמן יחידות פרטניות או הזן כמות, ולחץ "שלח לאישור".
          הבקשה תעבור לקצין המחסן הרלוונטי לאישור קבלה.
        </p>
      </Card>

      <ReturnForm
        items={[
          // פריטים פרטניים זמינים (לא חתומים על חיילים)
          ...new Map(serialUnits.map((u) => [u.itemTypeId, {
            id: u.itemTypeId, name: u.itemType.name, sku: u.itemType.sku,
            trackingMethod: u.itemType.trackingMethod,
          }])).values(),
          // פריטים כמותיים
          ...balances.map((b) => ({
            id: b.itemTypeId, name: b.itemType.name, sku: b.itemType.sku,
            trackingMethod: b.itemType.trackingMethod,
          })),
        ].filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i)}
        serialUnits={serialUnits.map((u) => ({
          id: u.id, itemTypeId: u.itemTypeId, serialNumber: u.serialNumber,
          lotQuantity: u.lotQuantity, statusName: u.status.name,
        }))}
        balances={balances.map((b) => ({
          itemTypeId: b.itemTypeId, statusId: b.statusId, statusName: b.status.name, quantity: b.quantity,
        }))}
        statuses={statuses.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault }))}
      />

      {/* היסטוריית זיכויים */}
      <Card className="mt-6">
        <h2 className="font-bold text-slate-700 p-4 border-b border-slate-200">היסטוריית זיכויים</h2>
        {recent.length === 0 ? (
          <EmptyState>אין זיכויים עדיין</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>תאריך</Th><Th>פריטים</Th><Th>למחסן</Th><Th>סטטוס</Th><Th>מאשר</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {recent.map((t) => (
                <tr key={t.id}>
                  <Td className="text-xs text-slate-500">{t.createdAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}</Td>
                  <Td>
                    {t.lines.map((l, i) => (
                      <span key={l.id} className="text-xs">
                        {i > 0 && ", "}
                        {l.itemType.name} ({l.quantity})
                      </span>
                    ))}
                  </Td>
                  <Td>{t.toHolder?.name ?? "—"}{t.toHolder?.warehouseType && <span className="text-xs text-slate-400"> · {WAREHOUSE_TYPE_SHORT[t.toHolder.warehouseType]}</span>}</Td>
                  <Td><Badge className={TRANSFER_STATUS_COLOR[t.status]}>{TRANSFER_STATUS[t.status]}</Badge></Td>
                  <Td className="text-xs text-slate-500">{t.approvedBy?.fullName ?? (t.status === "PENDING" ? "ממתין" : "—")}</Td>
                  <Td><a href={`/transfers/${t.id}/document`} className="text-xs text-blue-600 hover:underline">תעודה</a></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
