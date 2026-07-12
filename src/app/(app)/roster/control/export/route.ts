import ExcelJS from "exceljs";
import { requireScreenEdit } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

const ONE_DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
function enumerateDays(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = new Date(start + "T00:00:00Z").getTime(); t <= new Date(end + "T00:00:00Z").getTime(); t += ONE_DAY) out.push(iso(new Date(t)));
  return out;
}

/** ייצוא אקסל של החיילים והדיווחים (נוכחות בפועל) לטווח הנבחר במסך השליטה. */
export async function GET(req: Request) {
  const user = await requireScreenEdit("roster");
  const bId = user.battalionId!;
  const url = new URL(req.url);
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const validFrom = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null;
  const validTo = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : null;
  let rangeStart = validFrom ?? iso(new Date(new Date(todayStr + "T00:00:00Z").getTime() - 13 * ONE_DAY));
  const rangeEnd = validTo ?? todayStr;
  let days = enumerateDays(rangeStart, rangeEnd);
  if (days.length > 90) { days = days.slice(days.length - 90); rangeStart = days[0]; }

  const [soldiers, statuses, records] = await Promise.all([
    prisma.soldier.findMany({
      where: { battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] } },
      orderBy: [{ company: { name: "asc" } }, { squad: { sortOrder: "asc" } }, { fullName: "asc" }],
      select: { id: true, fullName: true, personalNumber: true, company: { select: { name: true } }, squad: { select: { name: true } } },
    }),
    prisma.attendanceStatus.findMany({ where: { battalionId: bId, active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, icon: true, isPresent: true } }),
    prisma.attendanceRecord.findMany({
      where: { date: { gte: new Date(rangeStart + "T00:00:00Z"), lte: new Date(rangeEnd + "T00:00:00Z") }, soldier: { battalionId: bId } },
      select: { soldierId: true, statusId: true, date: true },
    }),
  ]);
  const stById = new Map(statuses.map((s) => [s.id, s]));
  const presentIds = new Set(statuses.filter((s) => s.isPresent).map((s) => s.id));
  const cell = new Map<string, string>(); // `${soldierId}|${ymd}` → status name
  const presentByDay = new Map<string, Set<string>>();
  for (const r of records) {
    const ymd = iso(r.date);
    const st = stById.get(r.statusId);
    if (st) cell.set(`${r.soldierId}|${ymd}`, `${st.icon ?? ""} ${st.name}`.trim());
    if (presentIds.has(r.statusId)) { const s = presentByDay.get(ymd) ?? new Set(); s.add(r.soldierId); presentByDay.set(ymd, s); }
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("נוכחות בפועל", { views: [{ rightToLeft: true, state: "frozen", xSplit: 4, ySplit: 1 }] });
  const heDay = (ymd: string) => new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", weekday: "narrow", day: "2-digit", month: "2-digit" }).format(new Date(ymd + "T00:00:00"));
  ws.addRow(["פלוגה", "מחלקה", "שם", "מ\"א", ...days.map(heDay)]);
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
  for (const s of soldiers) {
    ws.addRow([s.company?.name ?? "—", s.squad?.name ?? "—", s.fullName, s.personalNumber ?? "", ...days.map((d) => cell.get(`${s.id}|${d}`) ?? "")]);
  }
  // שורת סיכום נוכחים ליום
  const totalRow = ws.addRow(["", "", "סה\"כ נוכחים", "", ...days.map((d) => presentByDay.get(d)?.size ?? 0)]);
  totalRow.font = { bold: true };
  ws.columns.forEach((c, i) => { c.width = i < 4 ? [14, 12, 20, 11][i] : 8; });

  const buf = await wb.xlsx.writeBuffer();
  const fname = `נוכחות_${rangeStart}_${rangeEnd}.xlsx`;
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`,
    },
  });
}
