import "server-only";
import { prisma } from "./prisma";

/** נאמן נחשב "פעיל עכשיו" אם ה-heartbeat שלו עודכן ב-5 הדקות האחרונות. */
export const PRESENCE_ACTIVE_MS = 5 * 60 * 1000;

export type OtherReporter = { name: string; minutesAgo: number; submittedAt: string | null };
export type LastSubmit = { name: string; at: string; byMe: boolean } | null;
export type PresenceState = { others: OtherReporter[]; lastSubmit: LastSubmit };

/** רישום/רענון נוכחות הנאמן הנוכחי (heartbeat). submitted=true מסמן שהרגע דיווח. */
export async function touchPresence(args: {
  battalionId: string; scopeKey: string; date: Date; reporterId: string; reporterName: string; submitted?: boolean;
}): Promise<void> {
  const { battalionId, scopeKey, date, reporterId, reporterName, submitted } = args;
  const submitPatch = submitted ? { lastSubmitAt: new Date() } : {};
  await prisma.attendanceReporterPresence.upsert({
    where: { scopeKey_date_reporterId: { scopeKey, date, reporterId } },
    update: { reporterName, ...submitPatch },
    create: { battalionId, scopeKey, date, reporterId, reporterName, ...submitPatch },
  });
}

/** קריאת מצב: אילו נאמנים *אחרים* פעילים כרגע על אותו scope+יום, ומי דיווח לאחרונה. */
export async function readPresence(scopeKey: string, date: Date, meId: string): Promise<PresenceState> {
  const rows = await prisma.attendanceReporterPresence.findMany({ where: { scopeKey, date } });
  const now = Date.now();
  const others: OtherReporter[] = rows
    .filter((r) => r.reporterId !== meId && now - r.lastActiveAt.getTime() < PRESENCE_ACTIVE_MS)
    .sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime())
    .map((r) => ({
      name: r.reporterName,
      minutesAgo: Math.max(0, Math.round((now - r.lastActiveAt.getTime()) / 60000)),
      submittedAt: r.lastSubmitAt ? r.lastSubmitAt.toISOString() : null,
    }));
  const submitted = rows.filter((r) => r.lastSubmitAt).sort((a, b) => b.lastSubmitAt!.getTime() - a.lastSubmitAt!.getTime());
  const lastSubmit: LastSubmit = submitted[0]
    ? { name: submitted[0].reporterName, at: submitted[0].lastSubmitAt!.toISOString(), byMe: submitted[0].reporterId === meId }
    : null;
  return { others, lastSubmit };
}
