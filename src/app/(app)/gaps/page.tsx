import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card, Table, Th, Td, EmptyState } from "@/components/ui";
import { DISCREPANCY_KIND } from "@/lib/labels";
import ResolveGap from "./ResolveGap";

export const dynamic = "force-dynamic";

export default async function GapsPage() {
  const user = await requireUser();
  const bId = user.battalionId!;
  const canResolve = can(user, "gaps.resolve");

  // ⚠️ סקופ — רס"פ פלוגה רואה רק פערים של הפלוגה שלו (פערים שהוא יצר בעצמו בספירה).
  // קצין מחסן — רק של המחסנים שלו. מפ"מ/אדמין-על — הכל.
  const scope = user.role === "COMPANY_REP" && user.holderId
    ? { holderId: user.holderId }
    : user.role === "WAREHOUSE_MANAGER" && user.holderIds?.length
      ? { holderId: { in: user.holderIds } }
      : {};

  // מזהי ספירות שהמשתמש יצר — גם הוא יכול לאשר פערים מהן
  const mySessions = await prisma.countSession.findMany({
    where: { battalionId: bId, startedById: user.id },
    select: { id: true },
  });
  const mySessionIds = new Set(mySessions.map((s) => s.id));

  const [open, resolved] = await Promise.all([
    prisma.discrepancy.findMany({
      where: { battalionId: bId, status: "OPEN", ...scope },
      include: {
        itemType: true, holder: true,
        session: {
          select: {
            lines: {
              select: {
                serialUnit: {
                  select: {
                    serialNumber: true,
                    physicalLocation: true,
                    signedSoldier: { select: { fullName: true, phone: true, telegramChatId: true } },
                    equipmentLocation: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.discrepancy.findMany({
      where: { battalionId: bId, status: "RESOLVED", ...scope },
      include: { itemType: true, holder: true, resolvedBy: true },
      orderBy: { resolvedAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="ניהול פערים"
        subtitle="חוסרים וחריגות מספירות — אישור ע״י מחולל הספירה או מנהל המערכת"
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <div className="text-sm text-slate-500">פערים פתוחים</div>
          <div className="text-3xl font-bold text-rose-600 mt-1">{open.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-slate-500">חוסרים / אובדן</div>
          <div className="text-3xl font-bold text-amber-600 mt-1">
            {open.filter((d) => d.kind === "LOSS").length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-slate-500">עודפים</div>
          <div className="text-3xl font-bold text-blue-600 mt-1">
            {open.filter((d) => d.kind === "SURPLUS").length}
          </div>
        </Card>
      </div>

      <h2 className="font-bold text-slate-700 mb-2">פערים פתוחים</h2>
      <Card className="mb-6">
        {open.length === 0 ? (
          <EmptyState>אין פערים פתוחים — אמינות מלאי מלאה ✓</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>פריט</Th><Th>מחזיק</Th><Th>חייל / מיקום</Th><Th>סוג</Th><Th>צפוי</Th><Th>נספר</Th><Th>פער</Th><Th>הערה</Th><Th>טיפול</Th></tr>
            </thead>
            <tbody>
              {open.map((d) => {
                const relatedLines = d.session?.lines ?? [];
                const line = relatedLines.find((l) => l.serialUnit?.signedSoldier);
                const soldier = line?.serialUnit?.signedSoldier;
                const anyLine = line ?? relatedLines.find((l) => l.serialUnit);
                const location = anyLine?.serialUnit?.equipmentLocation?.name || anyLine?.serialUnit?.physicalLocation;
                const isSNMismatch = d.resolution?.includes("אי-התאמת מס׳ סריאלי");
                return (
                  <tr key={d.id}>
                    <Td className="font-medium">{d.itemType.name}</Td>
                    <Td>{d.holder?.name ?? "—"}</Td>
                    <Td>
                      <div className="text-xs space-y-0.5">
                        {soldier && <div className="text-blue-600">{soldier.fullName}</div>}
                        {location && <div className="text-emerald-700">{location}</div>}
                      </div>
                    </Td>
                    <Td>
                      <Badge className={isSNMismatch ? "bg-amber-100 text-amber-700" : d.kind === "LOSS" ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700"}>
                        {isSNMismatch ? "סריאלי שגוי" : DISCREPANCY_KIND[d.kind]}
                      </Badge>
                    </Td>
                    <Td className="text-center">{d.expectedQty}</Td>
                    <Td className="text-center">{d.countedQty}</Td>
                    <Td className={`text-center font-bold ${d.diff < 0 ? "text-rose-600" : d.diff > 0 ? "text-blue-600" : "text-amber-600"}`}>
                      {d.diff > 0 ? `+${d.diff}` : d.diff === 0 ? "SN" : d.diff}
                    </Td>
                    <Td className="text-xs text-slate-500 max-w-40">
                      <span className="block truncate" title={d.resolution ?? ""}>{d.resolution ?? "—"}</span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {canResolve || (d.sessionId && mySessionIds.has(d.sessionId)) ? <ResolveGap id={d.id} /> : <span className="text-xs text-slate-400">ממתין</span>}
                        {soldier?.phone && (
                          <a href={`https://wa.me/972${soldier.phone.replace(/^0/, "")}?text=${encodeURIComponent(`שלום ${soldier.fullName}, נמצא פער בספירת מלאי עבור: ${d.itemType.name}. יש לבדוק ולעדכן.`)}`}
                            target="_blank" rel="noreferrer"
                            className="text-xs text-emerald-600 hover:text-emerald-800">📱</a>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {resolved.length > 0 && (
        <>
          <h2 className="font-bold text-slate-700 mb-2">פערים שנסגרו</h2>
          <Card>
            <Table>
              <thead>
                <tr><Th>פריט</Th><Th>מחזיק</Th><Th>פער</Th><Th>החלטה</Th><Th>אושר ע״י</Th></tr>
              </thead>
              <tbody>
                {resolved.map((d) => (
                  <tr key={d.id}>
                    <Td className="font-medium">{d.itemType.name}</Td>
                    <Td>{d.holder?.name ?? "—"}</Td>
                    <Td className="text-center">{d.diff > 0 ? `+${d.diff}` : d.diff}</Td>
                    <Td className="text-slate-600">{d.resolution}</Td>
                    <Td className="text-xs text-slate-500">{d.resolvedBy?.fullName}</Td>
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
