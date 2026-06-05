import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, Table, Th, Td, EmptyState } from "@/components/ui";
import { findTanaHolder } from "@/lib/tana";
import ReturnFromTanaModal from "./ReturnFromTanaModal";

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const user = await requireUser();
  const bId = user.battalionId!;
  if (!bId) redirect("/");

  // הרשאה: מפ"מ, קצין מחסן או רס"פ של פלוגת הטנא
  const isTanaRep = user.role === "COMPANY_REP" && user.holderId
    ? (await prisma.holder.findUnique({ where: { id: user.holderId }, select: { name: true } }))?.name?.includes("טנא")
    : false;
  const isAdmin = user.role === "BATTALION_ADMIN" || user.role === "WAREHOUSE_MANAGER";
  if (!isAdmin && !isTanaRep) redirect("/");

  const tana = await findTanaHolder(bId);
  if (!tana) {
    return (
      <div>
        <PageHeader title="ציוד תקול / טנא" subtitle="מסך תחזוקה לפלוגת הטנא" />
        <Card className="p-6 bg-amber-50 border-amber-300">
          <p className="text-sm text-amber-900">
            ⚠️ לא נמצאה פלוגת טנא בגדוד. כדי להפעיל את המודול — מפ״מ יקים פלוגה ששמה מכיל את המילה <b>טנא</b>{" "}
            ב-<Link href="/org" className="underline">/org</Link>.
          </p>
        </Card>
      </div>
    );
  }

  // הציוד שאצל הטנא: סריאלים + מאזני כמות
  const [serials, balances, holders, recentHistory] = await Promise.all([
    prisma.serialUnit.findMany({
      where: { battalionId: bId, currentHolderId: tana.id },
      include: { itemType: { include: { category: true } }, status: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.stockBalance.findMany({
      where: { battalionId: bId, holderId: tana.id, quantity: { gt: 0 } },
      include: { itemType: { include: { category: true } }, status: true },
    }),
    // יעדים אפשריים להחזרה
    prisma.holder.findMany({
      where: { battalionId: bId, active: true, kind: { in: ["WAREHOUSE", "COMPANY"] }, id: { not: tana.id } },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true },
    }),
    // היסטוריה: 30 שליחות אחרונות לטנא + יציאות
    prisma.transfer.findMany({
      where: {
        battalionId: bId,
        OR: [{ fromHolderId: tana.id }, { toHolderId: tana.id }],
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { fromHolder: true, toHolder: true, createdBy: { select: { fullName: true } }, _count: { select: { lines: true } } },
    }),
  ]);

  // איתור הסיבה האחרונה לכל פריט מטרנספרים
  const reasonByItem = new Map<string, string>();
  for (const t of recentHistory) {
    if (t.toHolderId === tana.id && t.reason?.includes("תקלה")) {
      // לא יודעים מי בדיוק מה-line, אז נשמור Reason לפי itemTypeId כקירוב
      const lines = await prisma.transferLine.findMany({ where: { transferId: t.id }, select: { itemTypeId: true, serialUnitId: true } });
      for (const l of lines) {
        const key = l.serialUnitId ?? `qty:${l.itemTypeId}`;
        if (!reasonByItem.has(key)) reasonByItem.set(key, t.reason ?? "");
      }
    }
  }

  return (
    <div>
      <PageHeader
        title="ציוד תקול / טנא"
        subtitle={`כל הציוד שנשלח לטנא לתיקון. ${serials.length} סריאליים + ${balances.reduce((a, b) => a + b.quantity, 0)} יח׳ כמותיים בטנא כעת.`}
        action={
          serials.length + balances.length > 0 ? (
            <ReturnFromTanaModal
              serials={serials.map((s) => ({
                id: s.id, itemTypeId: s.itemTypeId, itemName: s.itemType.name, serial: s.serialNumber,
                statusId: s.statusId, statusName: s.status.name,
                category: s.itemType.category?.name ?? null,
                reason: reasonByItem.get(s.id) ?? null,
              }))}
              balances={balances.map((b) => ({
                itemTypeId: b.itemTypeId, statusId: b.statusId, itemName: b.itemType.name, unit: b.itemType.unit,
                statusName: b.status.name, quantity: b.quantity,
                category: b.itemType.category?.name ?? null,
                reason: reasonByItem.get(`qty:${b.itemTypeId}`) ?? null,
              }))}
              holders={holders.map((h) => ({ id: h.id, name: h.name, kind: h.kind }))}
            />
          ) : undefined
        }
      />

      <Card className="p-3 mb-4 bg-blue-50 border-blue-200 text-xs text-blue-900">
        💡 לסמן פריט חדש כתקול: לחץ <b>🔧 שלח לטנא</b> במסך המלאי המתאים (מלאי המחסן / מלאי הפלוגה / החתמות).
        כאן רואים מה כעת אצל הטנא ומחזירים תקין ליעד.
      </Card>

      <h2 className="font-bold text-slate-700 mb-2">פריטים סריאליים בטנא ({serials.length})</h2>
      <Card className="mb-6">
        {serials.length === 0 ? (
          <EmptyState>אין פריטים סריאליים בטנא</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>פריט</Th><Th>קטגוריה</Th><Th>מ.ס.</Th><Th>סטטוס</Th><Th>תקלה</Th></tr>
            </thead>
            <tbody>
              {serials.map((s) => (
                <tr key={s.id}>
                  <Td className="font-medium">{s.itemType.name}</Td>
                  <Td className="text-xs text-slate-500">{s.itemType.category?.name ?? "—"}</Td>
                  <Td className="font-mono text-xs">{s.serialNumber}</Td>
                  <Td><Badge className="bg-amber-100 text-amber-800">{s.status.name}</Badge></Td>
                  <Td className="text-xs text-slate-600 max-w-xs truncate">{reasonByItem.get(s.id) ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <h2 className="font-bold text-slate-700 mb-2">פריטים כמותיים בטנא ({balances.length})</h2>
      <Card className="mb-6">
        {balances.length === 0 ? (
          <EmptyState>אין פריטים כמותיים בטנא</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>פריט</Th><Th>קטגוריה</Th><Th>כמות</Th><Th>סטטוס</Th><Th>תקלה</Th></tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={`${b.itemTypeId}:${b.statusId}`}>
                  <Td className="font-medium">{b.itemType.name}</Td>
                  <Td className="text-xs text-slate-500">{b.itemType.category?.name ?? "—"}</Td>
                  <Td className="text-center">{b.quantity} {b.itemType.unit}</Td>
                  <Td><Badge className="bg-amber-100 text-amber-800">{b.status.name}</Badge></Td>
                  <Td className="text-xs text-slate-600 max-w-xs truncate">{reasonByItem.get(`qty:${b.itemTypeId}`) ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <h2 className="font-bold text-slate-700 mb-2 mt-6">היסטוריית תעודות (טנא)</h2>
      <Card>
        {recentHistory.length === 0 ? (
          <EmptyState>אין תעודות עדיין</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>תאריך</Th><Th>סוג</Th><Th>מאת</Th><Th>אל</Th><Th>שורות</Th><Th>סיבה</Th><Th></Th></tr>
            </thead>
            <tbody>
              {recentHistory.map((t) => (
                <tr key={t.id}>
                  <Td className="text-xs text-slate-500">{t.createdAt.toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</Td>
                  <Td>
                    <Badge className={t.toHolderId === tana.id ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>
                      {t.toHolderId === tana.id ? "🔧 כניסה לטנא" : "✓ יציאה מטנא"}
                    </Badge>
                  </Td>
                  <Td className="text-xs">{t.fromHolder?.name ?? "—"}</Td>
                  <Td className="text-xs">{t.toHolder?.name ?? "—"}</Td>
                  <Td className="text-center">{t._count.lines}</Td>
                  <Td className="text-xs text-slate-600 max-w-xs truncate">{t.reason ?? "—"}</Td>
                  <Td><Link href={`/transfers/${t.id}/document`} className="text-xs text-blue-600 hover:underline">תעודה</Link></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
