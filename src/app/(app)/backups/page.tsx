import { requireSuperAdmin } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, Table, Th, Td, EmptyState } from "@/components/ui";
import BackupNowButton from "./BackupNowButton";

export const dynamic = "force-dynamic";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
function fmtIL(d: Date): string {
  return new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }).format(d);
}

export default async function BackupsPage() {
  await requireSuperAdmin();

  const [runs, withData] = await Promise.all([
    prisma.backupRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, createdAt: true, status: true, target: true, sizeBytes: true, rowCounts: true, error: true },
    }),
    // מי מכיל data להורדה — מסנן ב-SQL בלי לטעון את ה-JSON הכבד
    prisma.backupRun.findMany({ where: { data: { not: null } }, select: { id: true } }),
  ]);
  const downloadable = new Set(withData.map((r) => r.id));

  const okRuns = runs.filter((r) => r.status === "OK");
  const lastOk = okRuns[0] ?? null;

  return (
    <div>
      <PageHeader
        title="💾 גיבויים"
        subtitle="גיבוי אוטומטי פעמיים ביום (12:00 ו-00:00 שעון ישראל) · שכבת שחזור נוספת מעל Neon PITR"
        action={<BackupNowButton />}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Card className="p-4">
          <div className="text-xs text-slate-500">גיבוי אחרון תקין</div>
          <div className="text-lg font-bold text-slate-800">{lastOk ? fmtIL(lastOk.createdAt) : "— טרם —"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500">גודל אחרון</div>
          <div className="text-lg font-bold text-slate-800">{lastOk ? fmtBytes(lastOk.sizeBytes) : "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500">סה״כ ריצות שמורות</div>
          <div className="text-lg font-bold text-slate-800">{runs.length}</div>
        </Card>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 mb-4">
        ℹ️ הגיבוי כולל את נתוני הליבה (נשק, חתימות, שינועים, חיילים, מלאי). צילומי base64 (חתימות/רישיונות) אינם ב-snapshot — הם מגובים ב-Neon PITR. להורדה חיצונית: לחצו על ⬇️ ליד ריצה אחרונה ושמרו את הקובץ מחוץ למערכת.
      </div>

      {runs.length === 0 ? (
        <EmptyState>עדיין אין גיבויים — לחצו &quot;גבה עכשיו&quot; או המתינו לריצה האוטומטית הבאה</EmptyState>
      ) : (
        <Card className="p-0 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>מתי (שעון ישראל)</Th>
                <Th>סטטוס</Th>
                <Th>גודל</Th>
                <Th>רשומות</Th>
                <Th>הורדה</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const counts = (r.rowCounts as Record<string, number> | null) ?? {};
                const total = Object.values(counts).reduce((a, b) => a + b, 0);
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <Td>{fmtIL(r.createdAt)}</Td>
                    <Td>{r.status === "OK" ? <Badge className="bg-emerald-100 text-emerald-700">✅ תקין</Badge> : <Badge className="bg-rose-100 text-rose-700">❌ נכשל</Badge>}</Td>
                    <Td>{r.status === "OK" ? fmtBytes(r.sizeBytes) : <span className="text-rose-500 text-xs" title={r.error ?? ""}>{r.error?.slice(0, 40) ?? "שגיאה"}</span>}</Td>
                    <Td><span className="text-xs text-slate-500" title={Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join("\n")}>{total} רשומות</span></Td>
                    <Td>
                      {downloadable.has(r.id) ? (
                        <a href={`/api/backups/${r.id}`} className="text-indigo-600 hover:underline text-sm">⬇️ הורד JSON</a>
                      ) : (
                        <span className="text-slate-300 text-xs">— נוקה —</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
