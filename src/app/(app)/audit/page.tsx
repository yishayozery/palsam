import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card, Table, Th, Td, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<string, string> = {
  LOGIN: "התחברות",
  CREATE: "יצירה",
  UPDATE: "עדכון",
  DELETE: "מחיקה",
  INTAKE: "קליטת מלאי",
  WRITE_OFF: "גריעת מלאי",
  CREATE_ISSUE: "הקצאה",
  CREATE_RETURN: "החזרה",
  APPROVE: "אישור קבלה",
  REJECT: "דחייה",
  CREATE_SIGNOUT: "החתמה",
  SIGN: "חתימת חייל",
  CHECKIN: "זיכוי מהיר",
  UPDATE_LOCATION: "עדכון מיקום",
  START_COUNT: "פתיחת ספירה",
  SUBMIT_COUNT: "סיום ספירה",
  RESOLVE_GAP: "סגירת פער",
};

export default async function AuditPage() {
  const user = await requireCapability("audit.view");

  const logs = await prisma.auditLog.findMany({
    where: user.role === "SUPER_ADMIN" ? {} : { battalionId: user.battalionId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: true },
  });

  return (
    <div>
      <PageHeader title="יומן פעולות" subtitle="תיעוד מלא של פעולות המערכת (Audit Log)" />
      <Card>
        {logs.length === 0 ? (
          <EmptyState>אין רישומים</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>תאריך ושעה</Th><Th>משתמש</Th><Th>פעולה</Th><Th>ישות</Th><Th>פרטים</Th></tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <Td className="text-xs text-slate-500 whitespace-nowrap">
                    {l.createdAt.toLocaleString("he-IL")}
                  </Td>
                  <Td>{l.user?.fullName ?? <span className="text-slate-400">מערכת/חייל</span>}</Td>
                  <Td><Badge>{ACTION_LABELS[l.action] ?? l.action}</Badge></Td>
                  <Td className="text-slate-600">{l.entity}</Td>
                  <Td className="text-xs text-slate-400 font-mono max-w-xs truncate">
                    {l.details ? JSON.stringify(l.details) : "—"}
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
