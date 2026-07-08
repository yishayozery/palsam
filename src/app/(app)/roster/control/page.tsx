import { requireScreenEdit } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import ControlClient from "./ControlClient";

export const dynamic = "force-dynamic";

export default async function RosterControlPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireScreenEdit("roster");
  const bId = user.battalionId!;
  const sp = await searchParams;

  const now = new Date();
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(now);
  const dateStr = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayStr;
  const dateObj = new Date(dateStr + "T00:00:00Z");

  const [companies, soldiers, statuses, records, locks] = await Promise.all([
    prisma.holder.findMany({ where: { battalionId: bId, kind: "COMPANY", active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.soldier.findMany({ where: { battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] } }, orderBy: [{ company: { name: "asc" } }, { fullName: "asc" }], select: { id: true, fullName: true, personalNumber: true, companyId: true } }),
    prisma.attendanceStatus.findMany({ where: { battalionId: bId, active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, color: true, icon: true, isPresent: true } }),
    prisma.attendanceRecord.findMany({ where: { date: dateObj, soldier: { battalionId: bId } }, select: { soldierId: true, statusId: true } }),
    prisma.attendanceLock.findMany({ where: { battalionId: bId, date: dateObj }, select: { companyId: true } }),
  ]);

  const statusBySoldier = new Map(records.map((r) => [r.soldierId, r.statusId]));
  const lockedCompanies = new Set(locks.map((l) => l.companyId));
  const companyName = new Map(companies.map((c) => [c.id, c.name]));

  const companyData = companies.map((c) => {
    const cs = soldiers.filter((s) => s.companyId === c.id);
    return { id: c.id, name: c.name, total: cs.length, reported: cs.filter((s) => statusBySoldier.has(s.id)).length, locked: lockedCompanies.has(c.id) };
  });

  const statusData = statuses.map((st) => {
    const inStatus = soldiers.filter((s) => statusBySoldier.get(s.id) === st.id);
    return { id: st.id, name: st.name, color: st.color, icon: st.icon ?? "", isPresent: st.isPresent, count: inStatus.length, pns: inStatus.map((s) => s.personalNumber).filter((p): p is string => !!p) };
  });
  const notReportedList = soldiers.filter((s) => !statusBySoldier.has(s.id));
  const notReported = { count: notReportedList.length, pns: notReportedList.map((s) => s.personalNumber).filter((p): p is string => !!p) };

  const soldierRows = soldiers.map((s) => ({
    id: s.id, name: s.fullName, pn: s.personalNumber ?? "",
    company: s.companyId ? (companyName.get(s.companyId) ?? "—") : "—",
    statusName: statuses.find((st) => st.id === statusBySoldier.get(s.id))?.name ?? null,
  }));

  const totalReported = soldiers.filter((s) => statusBySoldier.has(s.id)).length;

  return (
    <div>
      <PageHeader helpKey="roster" title="🎛️ מסך שליטה — שלישות" subtitle="נעילת דיווחי פלוגות · פילוח נוכחות בפועל · העתקת מ.א לפי סטטוס" />
      <ControlClient
        date={dateStr}
        companies={companyData}
        statuses={statusData}
        notReported={notReported}
        soldierRows={soldierRows}
        totals={{ soldiers: soldiers.length, reported: totalReported, companiesReported: companyData.filter((c) => c.total > 0 && c.reported >= c.total).length, companiesTotal: companyData.filter((c) => c.total > 0).length }}
      />
    </div>
  );
}
