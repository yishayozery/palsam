import { requireScreenEdit } from "@/lib/guard";
import { canEdit } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import ControlClient from "./ControlClient";

export const dynamic = "force-dynamic";

const ONE_DAY = 86400000;
function iso(d: Date) { return d.toISOString().slice(0, 10); }
function enumerateDays(start: Date, end: Date): string[] {
  const out: string[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += ONE_DAY) out.push(iso(new Date(t)));
  return out;
}

export default async function RosterControlPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; employmentId?: string; from?: string; to?: string }>;
}) {
  const user = await requireScreenEdit("roster");
  const bId = user.battalionId!;
  const canManageEmployment = canEdit(user, "employment");
  const sp = await searchParams;

  const now = new Date();
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(now);
  const dateStr = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayStr;
  const dateObj = new Date(dateStr + "T00:00:00Z");

  const [companies, soldiers, statuses, employments, callups] = await Promise.all([
    prisma.holder.findMany({ where: { battalionId: bId, kind: "COMPANY", active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.soldier.findMany({ where: { battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] } }, orderBy: [{ company: { name: "asc" } }, { fullName: "asc" }], select: { id: true, fullName: true, personalNumber: true, companyId: true, isAttendanceReporter: true, attendanceReporterAllCompany: true, squad: { select: { name: true } } } }),
    prisma.attendanceStatus.findMany({ where: { battalionId: bId, active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, color: true, icon: true, isPresent: true } }),
    prisma.employment.findMany({ where: { battalionId: bId }, orderBy: [{ active: "desc" }, { startDate: "desc" }], select: { id: true, name: true, startDate: true, endDate: true, active: true } }),
    prisma.callupPeriod.findMany({ where: { soldier: { battalionId: bId } }, orderBy: { startDate: "desc" }, select: { id: true, soldierId: true, startDate: true, endDate: true } }),
  ]);

  // ── טווח מצטבר: from/to ידני > תעסוקה נבחרת > תעסוקה פעילה > 14 ימים אחרונים ──
  const validFrom = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : null;
  const validTo = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : null;
  const activeEmp = employments.find((e) => e.active) ?? employments[0] ?? null;
  const selectedEmp = sp.employmentId ? employments.find((e) => e.id === sp.employmentId) ?? null : (validFrom ? null : activeEmp);

  let rangeStart: string, rangeEnd: string;
  if (validFrom && validTo) {
    rangeStart = validFrom; rangeEnd = validTo;
  } else if (selectedEmp) {
    rangeStart = iso(selectedEmp.startDate);
    rangeEnd = iso(selectedEmp.endDate < now ? selectedEmp.endDate : now); // לא להציג עתיד
    if (rangeEnd < rangeStart) rangeEnd = rangeStart;
  } else {
    rangeEnd = todayStr;
    rangeStart = iso(new Date(dateObj.getTime() - 13 * ONE_DAY));
  }
  // תקרת ביטחון — עד 90 ימי-עמודות
  let days = enumerateDays(new Date(rangeStart + "T00:00:00Z"), new Date(rangeEnd + "T00:00:00Z"));
  if (days.length > 90) { days = days.slice(days.length - 90); rangeStart = days[0]; }

  const [dayRecords, rangeRecords, locks] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { date: dateObj, soldier: { battalionId: bId } }, select: { soldierId: true, statusId: true } }),
    prisma.attendanceRecord.findMany({
      where: { date: { gte: new Date(rangeStart + "T00:00:00Z"), lte: new Date(rangeEnd + "T00:00:00Z") }, soldier: { battalionId: bId } },
      select: { soldierId: true, statusId: true, date: true },
    }),
    prisma.attendanceLock.findMany({ where: { battalionId: bId, date: dateObj }, select: { companyId: true } }),
  ]);

  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const lockedCompanies = new Set(locks.map((l) => l.companyId));

  // ── שמ"פ: לכל חייל, פונקציית "פעיל ביום D" ──
  const callupBySoldier = new Map<string, { s: string; e: string | null }[]>();
  for (const c of callups) {
    const arr = callupBySoldier.get(c.soldierId) ?? [];
    arr.push({ s: iso(c.startDate), e: c.endDate ? iso(c.endDate) : null });
    callupBySoldier.set(c.soldierId, arr);
  }
  const inShmpOn = (soldierId: string, day: string): boolean => {
    const periods = callupBySoldier.get(soldierId);
    if (!periods) return false;
    return periods.some((p) => day >= p.s && (p.e === null || day <= p.e));
  };

  // ── בלוק יום-בודד (סטטוס פלוגות + פילוח) עבור dateStr ──
  const statusBySoldierDay = new Map(dayRecords.map((r) => [r.soldierId, r.statusId]));
  const companyData = companies.map((c) => {
    const cs = soldiers.filter((s) => s.companyId === c.id);
    const expected = cs.filter((s) => inShmpOn(s.id, dateStr));
    return {
      id: c.id, name: c.name, total: cs.length,
      reported: cs.filter((s) => statusBySoldierDay.has(s.id)).length,
      shmp: expected.length,
      shmpReported: expected.filter((s) => statusBySoldierDay.has(s.id)).length,
      locked: lockedCompanies.has(c.id),
    };
  });

  const statusData = statuses.map((st) => {
    const inStatus = soldiers.filter((s) => statusBySoldierDay.get(s.id) === st.id);
    return { id: st.id, name: st.name, color: st.color, icon: st.icon ?? "", isPresent: st.isPresent, count: inStatus.length, pns: inStatus.map((s) => s.personalNumber).filter((p): p is string => !!p) };
  });
  // "טרם דיווחו" מפוצל: בשמ"פ (דחוף) מול מחוץ לשמ"פ (לא מצופה)
  const notReportedAll = soldiers.filter((s) => !statusBySoldierDay.has(s.id));
  const nrInShmp = notReportedAll.filter((s) => inShmpOn(s.id, dateStr));
  const nrOffShmp = notReportedAll.filter((s) => !inShmpOn(s.id, dateStr));
  const notReported = {
    inShmp: { count: nrInShmp.length, pns: nrInShmp.map((s) => s.personalNumber).filter((p): p is string => !!p) },
    offShmp: { count: nrOffShmp.length, pns: nrOffShmp.map((s) => s.personalNumber).filter((p): p is string => !!p) },
  };

  // ── טבלה מצטברת: שורה=חייל, עמודות=days ──
  const recBySoldierDate = new Map<string, string>(); // `${soldierId}|${date}` -> statusId
  for (const r of rangeRecords) recBySoldierDate.set(`${r.soldierId}|${iso(r.date)}`, r.statusId);

  const aggRows = soldiers.map((s) => {
    const cells: string[] = [];   // statusId per day ("" = no report)
    const shmp: boolean[] = [];    // in-שמ"פ per day
    let shmpDays = 0, reportedDays = 0;
    const counts = new Map<string, number>();
    for (const d of days) {
      const active = inShmpOn(s.id, d);
      shmp.push(active);
      if (active) shmpDays++;
      const st = recBySoldierDate.get(`${s.id}|${d}`) ?? "";
      cells.push(st);
      if (st) {
        reportedDays++;
        if (active) counts.set(st, (counts.get(st) ?? 0) + 1);
      }
    }
    const denom = shmpDays || reportedDays || 1;
    return {
      id: s.id, name: s.fullName, pn: s.personalNumber ?? "",
      company: s.companyId ? (companyName.get(s.companyId) ?? "—") : "—",
      cells, shmp, shmpDays, reportedDays,
      counts: [...counts.entries()].map(([statusId, n]) => ({ statusId, n, pct: Math.round((n / denom) * 100) })),
    };
  });

  const totalReported = soldiers.filter((s) => statusBySoldierDay.has(s.id)).length;

  // 🟣 שמ"פ — לכל חייל התקופה הרלוונטית (פתוחה אם יש, אחרת האחרונה) — לניהול במסך השלישות
  const curCallup = new Map<string, { id: string; start: string; end: string | null }>();
  for (const c of callups) { // ממוין startDate desc
    const rec = { id: c.id, start: iso(c.startDate), end: c.endDate ? iso(c.endDate) : null };
    const cur = curCallup.get(c.soldierId);
    if (!cur) curCallup.set(c.soldierId, rec);
    else if (!c.endDate && cur.end) curCallup.set(c.soldierId, rec); // מעדיפים תקופה פתוחה
  }
  const shmpSoldiers = soldiers.map((s) => ({
    id: s.id, name: s.fullName,
    company: s.companyId ? (companyName.get(s.companyId) ?? "—") : "—",
    squad: s.squad?.name ?? null,
    callup: curCallup.get(s.id) ?? null,
  }));

  // הגדרות נוכחות — נאמני כ"א + חלון דיווח עתידי
  const [batWin, overrides] = await Promise.all([
    prisma.battalion.findUnique({ where: { id: bId }, select: { attendanceReportWindowDow: true } }),
    prisma.attendanceReportOverride.findMany({ where: { battalionId: bId }, orderBy: { date: "asc" }, select: { id: true, date: true, daysForward: true, note: true } }),
  ]);
  const reportWindow = Array.isArray(batWin?.attendanceReportWindowDow) ? (batWin!.attendanceReportWindowDow as unknown[]).map((n) => Number(n) || 0) : [0, 0, 0, 0, 0, 0, 0];
  const reporterCompanies = companies.map((c) => ({
    companyId: c.id, companyName: c.name,
    soldiers: soldiers.filter((s) => s.companyId === c.id).map((s) => ({ id: s.id, name: s.fullName, squadName: s.squad?.name ?? null, isReporter: s.isAttendanceReporter, allCompany: s.attendanceReporterAllCompany })),
  })).filter((c) => c.soldiers.length > 0);

  return (
    <div>
      <PageHeader helpKey="roster" title="🎛️ מסך שליטה — שלישות" subtitle="נעילת דיווחים · פילוח יומי · רצף נוכחות מצטבר לפי תעסוקה · הצלבת שמ״פ" />
      <ControlClient
        date={dateStr}
        companies={companyData}
        statuses={statusData}
        notReported={notReported}
        totals={{ soldiers: soldiers.length, reported: totalReported, companiesReported: companyData.filter((c) => c.total > 0 && c.reported >= c.total).length, companiesTotal: companyData.filter((c) => c.total > 0).length }}
        employments={employments.map((e) => ({ id: e.id, name: e.name, startDate: iso(e.startDate), endDate: iso(e.endDate), active: e.active }))}
        selectedEmploymentId={selectedEmp?.id ?? null}
        canManageEmployment={canManageEmployment}
        range={{ start: rangeStart, end: rangeEnd, manual: !!(validFrom && validTo) }}
        days={days}
        aggRows={aggRows}
        shmpSoldiers={shmpSoldiers}
        today={todayStr}
        attendanceSettings={{ companies: reporterCompanies, window: reportWindow, overrides: overrides.map((o) => ({ id: o.id, date: iso(o.date), daysForward: o.daysForward, note: o.note })) }}
      />
    </div>
  );
}
