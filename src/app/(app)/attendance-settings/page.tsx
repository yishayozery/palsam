import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import AttendanceSettingsClient from "./AttendanceSettingsClient";
import { saveAttendanceReminder } from "./actions";

export const dynamic = "force-dynamic";

export default async function AttendanceSettingsPage() {
  const user = await requireUser();
  if (!can(user, "attendance.manage") && !can(user, "battalion.profile")) redirect("/");
  const bId = user.battalionId!;

  const battalion = await prisma.battalion.findUnique({
    where: { id: bId },
    select: { attendanceReminderEnabled: true, attendanceReminderText: true, telegramBotToken: true },
  });
  const reporterCount = await prisma.appUser.count({
    where: { battalionId: bId, active: true, role: "COMPANY_REP", soldier: { is: { telegramChatId: { not: null } } } },
  });

  const statuses = await prisma.attendanceStatus.findMany({
    where: { battalionId: bId },
    orderBy: { sortOrder: "asc" },
  });

  const companies = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "COMPANY", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const squads = await prisma.squad.findMany({
    where: { battalionId: bId },
    orderBy: [{ company: { name: "asc" } }, { sortOrder: "asc" }],
    include: { company: { select: { name: true } }, _count: { select: { soldiers: true } } },
  });

  return (
    <div>
      <PageHeader
        title="⚙️ הגדרות נוכחות"
        subtitle="הגדר סטטוסי נוכחות, מחלקות, ותזכורת בוקר"
      />

      {/* 🗓️ תזכורת בוקר לדיווח נוכחות */}
      <Card className="p-4 mb-4 bg-blue-50 border-blue-200">
        <h3 className="font-bold text-blue-900 text-sm mb-1">🗓️ תזכורת בוקר לדיווח נוכחות</h3>
        <p className="text-xs text-blue-800 mb-3">
          כשמופעל, כל בוקר נשלח טלגרם למדווחי הפלוגות (רס״פ עם טלגרם מקושר) עם לינק לדיווח נוכחות.
          {" "}כרגע <b>{reporterCount}</b> מדווחים יקבלו.
          {!battalion?.telegramBotToken && <span className="text-rose-600"> ⚠️ בוט טלגרם לא מוגדר בגדוד.</span>}
        </p>
        <form action={saveAttendanceReminder} className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={battalion?.attendanceReminderEnabled ?? false} className="w-4 h-4 rounded accent-blue-600" />
            <span className="font-medium text-blue-900">הפעל תזכורת בוקר יומית</span>
          </label>
          <input name="text" defaultValue={battalion?.attendanceReminderText ?? ""} placeholder="טקסט מותאם (אופציונלי) — למשל: בוקר טוב, דווחו נוכחות עד 09:00"
            className="w-full rounded-lg border border-blue-300 px-3 py-2 text-sm" />
          <button className="bg-blue-700 hover:bg-blue-800 text-white rounded-lg px-4 py-2 text-sm font-medium">💾 שמור תזכורת</button>
        </form>
      </Card>

      <AttendanceSettingsClient
        statuses={statuses}
        companies={companies}
        squads={squads.map((s) => ({
          id: s.id,
          name: s.name,
          companyId: s.companyId,
          companyName: s.company.name,
          sortOrder: s.sortOrder,
          soldierCount: s._count.soldiers,
        }))}
      />
    </div>
  );
}
