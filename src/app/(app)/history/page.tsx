import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, Table, Th, Td, EmptyState } from "@/components/ui";
import { TRANSFER_TYPE } from "@/lib/labels";

export const dynamic = "force-dynamic";

type SearchParams = { item?: string; soldier?: string; doc?: string; from?: string; to?: string };

const TYPE_ICONS: Record<string, string> = {
  INTAKE: "📥", WRITE_OFF: "📤", ISSUE: "🏪→🪖", RETURN: "🪖→🏪",
  SIGNOUT: "✍️", CHECKIN: "↩️",
};

export default async function HistoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const bId = user.battalionId!;
  const sp = await searchParams;
  const { item = "", soldier = "", doc = "", from = "", to = "" } = sp;

  // סקופ — קצין מחסן רק שלו, רס"פ רק שלו, מפ"מ הכל
  const isWM = user.role === "WAREHOUSE_MANAGER" && user.holderIds.length > 0;
  const isCR = user.role === "COMPANY_REP" && user.holderId;
  const scopeFilter = isWM
    ? { OR: [{ fromHolderId: { in: user.holderIds } }, { toHolderId: { in: user.holderIds } }] }
    : isCR
      ? { OR: [{ fromHolderId: user.holderId! }, { toHolderId: user.holderId! }, { toSoldier: { companyId: user.holderId! } }] }
      : {};

  // חיפוש לפי פריט/חייל/תעודה
  const lineFilter = item.trim() ? {
    lines: { some: { itemType: { OR: [{ name: { contains: item.trim(), mode: "insensitive" as const } }, { sku: { contains: item.trim(), mode: "insensitive" as const } }] } } },
  } : {};
  const soldierFilter = soldier.trim() ? {
    OR: [
      { toSoldier: { fullName: { contains: soldier.trim(), mode: "insensitive" as const } } },
      { toSoldier: { personalNumber: { contains: soldier.trim() } } },
      { signatures: { some: { soldier: { OR: [{ fullName: { contains: soldier.trim(), mode: "insensitive" as const } }, { personalNumber: { contains: soldier.trim() } }] } } } },
    ],
  } : {};
  const docFilter = doc.trim() ? {
    id: { endsWith: doc.trim().toLowerCase() },
  } : {};
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (from) dateFilter.gte = new Date(from);
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    dateFilter.lte = end;
  }

  const transfers = await prisma.transfer.findMany({
    where: {
      battalionId: bId,
      ...scopeFilter,
      ...lineFilter,
      ...soldierFilter,
      ...docFilter,
      ...(from || to ? { createdAt: dateFilter } : {}),
    },
    include: {
      fromHolder: { select: { name: true } },
      toHolder: { select: { name: true } },
      toSoldier: { select: { fullName: true, personalNumber: true } },
      createdBy: { select: { fullName: true } },
      approvedBy: { select: { fullName: true } },
      _count: { select: { lines: true } },
      lines: { include: { itemType: { select: { name: true, sku: true } }, serialUnit: { select: { serialNumber: true, lotQuantity: true } } }, take: 5 },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const hasFilter = !!(item || soldier || doc || from || to);

  return (
    <div>
      <PageHeader
        title="📜 היסטוריה גלובלית"
        subtitle="חפש לפי פריט, תעודה, חייל או טווח תאריכים"
      />

      <Card className="p-4 mb-4 bg-blue-50 border-blue-200">
        <form method="GET" className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <div>
            <label className="block text-[11px] text-slate-600 mb-0.5">📦 פריט (שם/מק״ט)</label>
            <input name="item" defaultValue={item} placeholder="M4, רימון..."
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white" />
          </div>
          <div>
            <label className="block text-[11px] text-slate-600 mb-0.5">🪖 חייל (שם/מ.א.)</label>
            <input name="soldier" defaultValue={soldier} placeholder="אבי / 1234567"
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white" />
          </div>
          <div>
            <label className="block text-[11px] text-slate-600 mb-0.5">📄 מס׳ תעודה (8 ספרות)</label>
            <input name="doc" defaultValue={doc} placeholder="abc12345"
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white font-mono" />
          </div>
          <div>
            <label className="block text-[11px] text-slate-600 mb-0.5">📅 מתאריך</label>
            <input type="date" name="from" defaultValue={from}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white" />
          </div>
          <div>
            <label className="block text-[11px] text-slate-600 mb-0.5">📅 עד תאריך</label>
            <input type="date" name="to" defaultValue={to}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white" />
          </div>
          <div className="md:col-span-5 flex gap-2">
            <button className="bg-blue-700 hover:bg-blue-800 text-white rounded-lg px-4 py-1.5 text-sm font-medium">
              🔍 חפש
            </button>
            {hasFilter && (
              <Link href="/history" className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-50">
                ✕ נקה
              </Link>
            )}
            <span className="text-xs text-slate-500 mr-auto self-center">
              {transfers.length} {transfers.length === 200 && "(200 ראשונות)"} תוצאות
            </span>
          </div>
        </form>
      </Card>

      <Card>
        {transfers.length === 0 ? (
          <EmptyState>
            {hasFilter ? "לא נמצאו תעודות תואמות לחיפוש" : "אין תעודות במערכת עדיין"}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>תאריך</Th><Th>סוג</Th><Th>פריטים</Th><Th>מאת ← אל</Th>
                <Th>בוצע ע״י</Th><Th>סטטוס</Th><Th>תעודה</Th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id}>
                  <Td className="text-xs text-slate-500 whitespace-nowrap">
                    {t.createdAt.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                    <br />{t.createdAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                  </Td>
                  <Td>
                    <Badge className={
                      t.type === "INTAKE" ? "bg-emerald-100 text-emerald-800"
                        : t.type === "WRITE_OFF" ? "bg-rose-100 text-rose-700"
                        : t.type === "SIGNOUT" ? "bg-purple-100 text-purple-800"
                        : t.type === "CHECKIN" ? "bg-amber-100 text-amber-800"
                        : "bg-blue-100 text-blue-800"
                    }>
                      {TYPE_ICONS[t.type] ?? "📋"} {TRANSFER_TYPE[t.type]}
                    </Badge>
                  </Td>
                  <Td className="text-xs">
                    <div className="font-medium">{t._count.lines} שורות</div>
                    <div className="text-slate-500 text-[11px] truncate max-w-xs">
                      {t.lines.slice(0, 3).map((l, i) => (
                        <span key={l.id}>{i > 0 && ", "}{l.itemType.name}
                          {l.serialUnit && <span className="text-[10px] font-mono"> ({l.serialUnit.lotQuantity && l.serialUnit.lotQuantity > 1 ? "לוט " : ""}{l.serialUnit.serialNumber})</span>}
                        </span>
                      ))}
                      {t.lines.length > 3 && <span> ...</span>}
                    </div>
                  </Td>
                  <Td className="text-xs">
                    <div>{t.fromHolder?.name ?? t.externalUnit ?? "—"}</div>
                    <div className="text-slate-400">↓</div>
                    <div className="font-medium">
                      {t.toSoldier?.fullName ?? t.toHolder?.name ?? "—"}
                      {t.toSoldier?.personalNumber && <span className="text-[10px] font-mono text-slate-400 mr-1">{t.toSoldier.personalNumber}</span>}
                    </div>
                  </Td>
                  <Td className="text-xs">{t.createdBy.fullName}</Td>
                  <Td>
                    <Badge className={
                      t.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800"
                        : t.status === "PENDING" ? "bg-amber-100 text-amber-800"
                        : "bg-rose-100 text-rose-700"
                    }>
                      {t.status === "COMPLETED" ? "✓" : t.status === "PENDING" ? "⏳" : "✕"} {t.status}
                    </Badge>
                  </Td>
                  <Td>
                    <Link href={`/transfers/${t.id}/document`} className="text-xs text-blue-600 hover:underline">
                      📄 פתח
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
