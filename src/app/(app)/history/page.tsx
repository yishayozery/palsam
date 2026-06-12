import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, Table, Th, Td, EmptyState } from "@/components/ui";
import { TRANSFER_TYPE } from "@/lib/labels";

export const dynamic = "force-dynamic";

type SearchParams = { item?: string; soldier?: string; doc?: string; from?: string; to?: string; type?: string; direction?: string };

const TYPE_ICONS: Record<string, string> = {
  INTAKE: "📥", WRITE_OFF: "📤", ISSUE: "🏪→🪖", RETURN: "🪖→🏪",
  SIGNOUT: "✍️", CHECKIN: "↩️",
};

// כיוון תנועה גדודי: in=כניסה למלאי הגדוד/מחסן, out=יציאה מהגדוד/למטה
const DIRECTION: Record<string, "in" | "out"> = {
  INTAKE: "in", RETURN: "in", CHECKIN: "in",
  WRITE_OFF: "out", ISSUE: "out", SIGNOUT: "out",
};

export default async function HistoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const bId = user.battalionId!;
  const sp = await searchParams;
  const { item = "", soldier = "", doc = "", from = "", to = "", type = "", direction = "" } = sp;

  const isWM = user.role === "WAREHOUSE_MANAGER" && user.holderIds.length > 0;
  const isCR = user.role === "COMPANY_REP" && user.holderId;
  const scopeFilter = isWM
    ? { OR: [{ fromHolderId: { in: user.holderIds } }, { toHolderId: { in: user.holderIds } }] }
    : isCR
      ? { OR: [{ fromHolderId: user.holderId! }, { toHolderId: user.holderId! }, { toSoldier: { companyId: user.holderId! } }] }
      : {};

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
  const docFilter = doc.trim() ? { id: { endsWith: doc.trim().toLowerCase() } } : {};
  const typeFilter = type.trim() ? { type: type.trim() as "INTAKE" | "WRITE_OFF" | "ISSUE" | "RETURN" | "SIGNOUT" | "CHECKIN" } : {};
  const directionTypes = direction === "in"
    ? ["INTAKE", "RETURN", "CHECKIN"]
    : direction === "out"
      ? ["WRITE_OFF", "ISSUE", "SIGNOUT"]
      : null;
  const directionFilter = directionTypes ? { type: { in: directionTypes as ("INTAKE" | "WRITE_OFF" | "ISSUE" | "RETURN" | "SIGNOUT" | "CHECKIN")[] } } : {};
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (from) dateFilter.gte = new Date(from);
  if (to) { const end = new Date(to); end.setHours(23, 59, 59, 999); dateFilter.lte = end; }

  const [itemsList, soldiersList] = await Promise.all([
    prisma.itemType.findMany({
      where: { battalionId: bId, active: true }, orderBy: { name: "asc" },
      select: { name: true, sku: true },
    }),
    prisma.soldier.findMany({
      where: { battalionId: bId, active: true }, orderBy: { fullName: "asc" },
      select: { fullName: true, personalNumber: true },
    }),
  ]);

  const transfers = await prisma.transfer.findMany({
    where: {
      battalionId: bId,
      ...scopeFilter, ...lineFilter, ...soldierFilter, ...docFilter, ...typeFilter, ...directionFilter,
      ...(from || to ? { createdAt: dateFilter } : {}),
    },
    include: {
      fromHolder: { select: { name: true } },
      toHolder: { select: { name: true } },
      toSoldier: { select: { fullName: true, personalNumber: true } },
      createdBy: { select: { fullName: true } },
      lines: { include: { itemType: { select: { name: true, sku: true } }, serialUnit: { select: { serialNumber: true, lotQuantity: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const hasFilter = !!(item || soldier || doc || from || to || type || direction);
  const qs = new URLSearchParams();
  if (item) qs.set("item", item);
  if (soldier) qs.set("soldier", soldier);
  if (doc) qs.set("doc", doc);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (type) qs.set("type", type);
  if (direction) qs.set("direction", direction);
  const exportHref = `/history/export${qs.toString() ? `?${qs.toString()}` : ""}`;

  return (
    <div>
      <PageHeader
        title="📜 היסטוריה גלובלית"
        subtitle="חפש לפי פריט, תעודה, חייל, סוג תנועה או טווח תאריכים"
        action={
          <a href={exportHref}
            className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg px-4 py-2 text-sm font-medium">
            📊 ייצוא לאקסל
          </a>
        }
      />

      <Card className="p-4 mb-4 bg-blue-50 border-blue-200">
        <form method="GET" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <label className="block text-[11px] text-slate-600 mb-0.5">📦 פריט</label>
            <input name="item" defaultValue={item} placeholder="התחל להקליד..." list="items-list"
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white" />
            <datalist id="items-list">
              {itemsList.map((i) => (
                <option key={i.name} value={i.name}>{i.sku ? `${i.sku} · ${i.name}` : i.name}</option>
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-[11px] text-slate-600 mb-0.5">🪖 חייל</label>
            <input name="soldier" defaultValue={soldier} placeholder="שם / מ.א..." list="soldiers-list"
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white" />
            <datalist id="soldiers-list">
              {soldiersList.map((s) => (
                <option key={`${s.fullName}-${s.personalNumber ?? ""}`} value={s.fullName}>
                  {s.personalNumber ? `${s.personalNumber} · ${s.fullName}` : s.fullName}
                </option>
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-[11px] text-slate-600 mb-0.5">🔀 סוג תנועה</label>
            <select name="type" defaultValue={type}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
              <option value="">— כל הסוגים —</option>
              {Object.entries(TRANSFER_TYPE).map(([k, v]) => (
                <option key={k} value={k}>{TYPE_ICONS[k] ?? ""} {v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-600 mb-0.5">↕️ כיוון</label>
            <select name="direction" defaultValue={direction}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
              <option value="">— הכל —</option>
              <option value="in">⬇️ כניסה (קליטה/זיכוי)</option>
              <option value="out">⬆️ יציאה (החתמה/הוצאה)</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-600 mb-0.5">📄 מס׳ תעודה</label>
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
          <div className="flex items-end gap-2">
            <button className="bg-blue-700 hover:bg-blue-800 text-white rounded-lg px-4 py-1.5 text-sm font-medium">
              🔍 חפש
            </button>
            {hasFilter && (
              <Link href="/history" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
                ✕ נקה
              </Link>
            )}
          </div>
          <div className="md:col-span-4 text-xs text-slate-500">
            {transfers.length} {transfers.length === 200 && "(200 ראשונות)"} תוצאות
          </div>
        </form>
      </Card>

      <Card>
        {transfers.length === 0 ? (
          <EmptyState>
            {hasFilter ? "לא נמצאו תעודות תואמות לחיפוש" : "אין תעודות במערכת עדיין"}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>תאריך</Th>
                  <Th>סוג</Th>
                  <Th>כיוון</Th>
                  <Th>מאת</Th>
                  <Th>אל</Th>
                  <Th>פריטים</Th>
                  <Th>כמות</Th>
                  <Th>בוצע ע״י</Th>
                  <Th>סטטוס</Th>
                  <Th>תעודה</Th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => {
                  const dir = DIRECTION[t.type];
                  const totalQty = t.lines.reduce((sum, l) => sum + (l.quantity || (l.serialUnit?.lotQuantity ?? 1)), 0);
                  const fromName = t.fromHolder?.name ?? t.externalUnit ?? "—";
                  const toName = t.toSoldier?.fullName ?? t.toHolder?.name ?? "—";
                  return (
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
                      <Td>
                        {dir === "in" ? (
                          <Badge className="bg-emerald-100 text-emerald-800">⬇️ כניסה</Badge>
                        ) : dir === "out" ? (
                          <Badge className="bg-rose-100 text-rose-700">⬆️ יציאה</Badge>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </Td>
                      <Td className="text-xs">{fromName}</Td>
                      <Td className="text-xs">
                        <div className="font-medium">{toName}</div>
                        {t.toSoldier?.personalNumber && <div className="text-[10px] font-mono text-slate-400">{t.toSoldier.personalNumber}</div>}
                      </Td>
                      <Td className="text-xs max-w-xs">
                        <div className="text-slate-600 text-[11px] truncate">
                          {t.lines.slice(0, 3).map((l, i) => (
                            <span key={l.id}>{i > 0 && ", "}{l.itemType.name}</span>
                          ))}
                          {t.lines.length > 3 && <span> +{t.lines.length - 3}</span>}
                        </div>
                      </Td>
                      <Td className="text-sm font-bold text-center">{totalQty}</Td>
                      <Td className="text-xs">{t.createdBy.fullName}</Td>
                      <Td>
                        <Badge className={
                          t.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800"
                            : t.status === "PENDING" ? "bg-amber-100 text-amber-800"
                            : "bg-rose-100 text-rose-700"
                        }>
                          {t.status === "COMPLETED" ? "✓" : t.status === "PENDING" ? "⏳" : "✕"}
                        </Badge>
                      </Td>
                      <Td>
                        <Link href={`/transfers/${t.id}/document`} className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                          📄 פתח
                        </Link>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
