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
  // חיווי בריאות — גיבוי פעמיים ביום (כל ~12ש'); מתריע אם עברו 14+ שעות מאז גיבוי תקין
  // eslint-disable-next-line react-hooks/purity -- Server Component (force-dynamic); הזמן נקרא בכל בקשה
  const hoursSinceOk = lastOk ? (Date.now() - lastOk.createdAt.getTime()) / 3600000 : Infinity;
  const healthy = hoursSinceOk < 14;
  const lastFailed = runs[0]?.status === "FAIL";

  // 📤 בריאות העותק החיצוני — נמדדת על **חלון** ולא על הריצה האחרונה בלבד.
  //    כשל off-site אינו מפיל את הגיבוי, ולכן ריצה אחת שהצליחה הסתירה בעבר סדרה של כשלים.
  const isOffsite = (r: (typeof runs)[number]) =>
    r.target?.includes("OFFSITE") || (r.rowCounts as Record<string, number> | null)?._offsite === 1;
  const window20 = okRuns.slice(0, 20);
  const offsiteSent = window20.filter(isOffsite).length;
  const offsiteFails = window20.filter((r) => !isOffsite(r) && r.error?.startsWith("offsite:"));
  const offsiteConfigured = offsiteSent > 0 || offsiteFails.length > 0;
  const offsiteHealthy = offsiteConfigured && offsiteFails.length === 0;
  const lastOffsiteReason = offsiteFails[0]?.error?.replace(/^offsite:\s*/, "") ?? null;

  return (
    <div>
      <PageHeader
        title="💾 גיבויים"
        subtitle="גיבוי אוטומטי פעמיים ביום (12:00 ו-00:00) + ידני בכל עת · שכבת שחזור מעל Neon PITR"
        action={<BackupNowButton />}
      />

      <div className={`rounded-xl p-3 mb-4 text-sm font-medium border ${healthy ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-300 text-rose-800"}`}>
        {healthy
          ? `✅ הגיבויים תקינים — הגיבוי האחרון לפני ${hoursSinceOk < 1 ? "פחות משעה" : `${Math.floor(hoursSinceOk)} שעות`}.`
          : lastOk
            ? `⚠️ לא בוצע גיבוי תקין כבר ${Math.floor(hoursSinceOk)} שעות! בדוק שה-cron החיצוני פועל, או לחץ "גבה עכשיו".`
            : `⚠️ עדיין לא בוצע אף גיבוי תקין. הגדר את ה-cron החיצוני או לחץ "גבה עכשיו".`}
        {lastFailed && " · הריצה האחרונה נכשלה."}
      </div>

      <div className={`rounded-xl p-3 mb-4 text-sm font-medium border ${offsiteHealthy ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-300 text-amber-800"}`}>
        {!offsiteConfigured ? (
          "⚠️ עותק off-site לא פעיל — הגדר את משתנה הסביבה BACKUP_EMAIL (ב-Vercel) כדי לשלוח כל גיבוי כצרופה מוצפנת מחוץ למסד הנתונים. שחזור: scripts/decrypt-backup.ts."
        ) : offsiteHealthy ? (
          `📤 עותק off-site תקין — ${offsiteSent}/${window20.length} הגיבויים האחרונים נשלחו כצרופת מייל מוצפנת (מחוץ ל-Neon).`
        ) : (
          <>
            ⚠️ עותק off-site נכשל ב-{offsiteFails.length} מתוך {window20.length} הגיבויים האחרונים. זהו העותק היחיד מחוץ ל-Neon — בלעדיו הגיבוי חי באותו מקום שהוא בא להגן עליו.
            {lastOffsiteReason && <div className="mt-1 font-mono text-xs opacity-80 break-all">סיבה אחרונה: {lastOffsiteReason}</div>}
          </>
        )}
      </div>

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
        ℹ️ הגיבוי כולל את נתוני הליבה (נשק, חתימות, שינועים, חיילים, מלאי). צילומי base64 (חתימות/רישיונות) אינם ב-snapshot — הם מגובים ב-Neon PITR. עותק off-site: אם הוגדר BACKUP_EMAIL, כל גיבוי נשלח אוטומטית כצרופה מוצפנת למייל (📤). להורדה ידנית: לחצו על ⬇️ ליד ריצה אחרונה.
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
                const total = Object.entries(counts).filter(([k]) => !k.startsWith("_")).reduce((a, [, v]) => a + v, 0);
                const rowOffsite = r.target?.includes("OFFSITE") || counts._offsite === 1;
                // גיבוי תקין שהעותק החיצוני שלו נכשל — היה עד כה בלתי-נראה בטבלה
                const rowOffsiteErr = r.status === "OK" && r.error?.startsWith("offsite:") ? r.error.replace(/^offsite:\s*/, "") : null;
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <Td>{fmtIL(r.createdAt)}</Td>
                    <Td className="whitespace-nowrap">
                      {r.status === "OK" ? <Badge className="bg-emerald-100 text-emerald-700">✅ תקין</Badge>
                        : r.status === "RUNNING" ? <Badge className="bg-sky-100 text-sky-700">⏳ רץ…</Badge>
                        : <Badge className="bg-rose-100 text-rose-700">❌ נכשל</Badge>}
                      {rowOffsite && <span title="נשלח off-site (מייל מוצפן)" className="mr-1">📤</span>}
                      {rowOffsiteErr && <span title={`העותק החיצוני נכשל: ${rowOffsiteErr}`} className="mr-1">⚠️</span>}
                    </Td>
                    <Td>
                      {r.status === "OK" ? (
                        <>
                          {fmtBytes(r.sizeBytes)}
                          {rowOffsiteErr && <div className="text-amber-600 text-xs" title={rowOffsiteErr}>off-site נכשל</div>}
                        </>
                      ) : (
                        <span className="text-rose-500 text-xs" title={r.error ?? ""}>{r.error?.slice(0, 40) ?? "שגיאה"}</span>
                      )}
                    </Td>
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
