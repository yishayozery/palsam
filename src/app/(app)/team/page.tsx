import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import PeopleTabs from "@/components/PeopleTabs";
import TeamClient from "./TeamClient";

export const dynamic = "force-dynamic";

const DEFAULT_DELEGATE_CAP = 2; // חייב להתאים ל-team/actions.ts

export default async function TeamPage() {
  const user = await requireUser();
  const bId = user.battalionId;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const isAdmin = user.isAdmin || user.isSuperAdmin;

  const battalion = bId ? await prisma.battalion.findUnique({ where: { id: bId }, select: { defaultDelegateCap: true } }) : null;
  const defaultCap = battalion?.defaultDelegateCap ?? DEFAULT_DELEGATE_CAP;

  // מנהל מערכת רואה את כל היחידות (תמונת-על); מנהל יחידה רואה את שלו בלבד.
  const holders = bId
    ? await prisma.holder.findMany({
        where: {
          battalionId: bId,
          active: true,
          kind: { in: ["COMPANY", "WAREHOUSE"] },
          ...(isAdmin ? {} : { id: { in: user.holderIds } }),
        },
        select: { id: true, kind: true, name: true, delegateCap: true },
        orderBy: [{ kind: "asc" }, { name: "asc" }],
      })
    : [];

  const holderIds = holders.map((h) => h.id);

  const [subUsers, soldiers, linkedSoldierIds, squads, squadCmdLinks] = holderIds.length
    ? await Promise.all([
        prisma.appUser.findMany({
          where: { holderId: { in: holderIds }, active: true, id: { not: user.id } },
          select: { id: true, username: true, fullName: true, phone: true, holderId: true, passwordSet: true, inviteToken: true, systemRole: { select: { name: true } }, soldier: { select: { telegramChatId: true } } },
          orderBy: { createdAt: "asc" },
        }),
        prisma.soldier.findMany({
          where: { battalionId: bId!, status: { notIn: ["DISCHARGED", "INACTIVE"] } },
          select: {
            id: true, fullName: true, companyId: true, squadId: true, telegramChatId: true,
            companyRole: { select: { name: true, isCommander: true, sortOrder: true } },
          },
          orderBy: { fullName: "asc" },
        }),
        prisma.appUser.findMany({ where: { soldierId: { not: null } }, select: { soldierId: true } }),
        prisma.squad.findMany({ where: { companyId: { in: holderIds }, active: true }, select: { id: true, name: true, companyId: true }, orderBy: { sortOrder: "asc" } }),
        prisma.userSquad.findMany({ where: { user: { active: true, holderId: { in: holderIds } } }, select: { userId: true, squadId: true } }),
      ])
    : [[], [], [], [], []];

  const linkedSet = new Set((linkedSoldierIds as { soldierId: string | null }[]).map((l) => l.soldierId));
  const cmdSquadByUser = new Map((squadCmdLinks as { userId: string; squadId: string }[]).map((l) => [l.userId, l.squadId]));
  const squadNameById = new Map((squads as { id: string; name: string }[]).map((s) => [s.id, s.name]));

  type U = { id: string; username: string; fullName: string; phone: string | null; holderId: string | null; passwordSet: boolean; inviteToken: string | null; systemRole: { name: string } | null; soldier: { telegramChatId: string | null } | null };
  const allUsers = subUsers as U[];

  type SoldierLite = { id: string; fullName: string; companyId: string | null; squadId: string | null; telegramChatId: string | null; companyRole: { name: string; isCommander: boolean; sortOrder: number } | null };
  const allSoldiers = soldiers as SoldierLite[];

  const data = holders.map((h) => {
    const hUsers = allUsers.filter((u) => u.holderId === h.id);
    const squadCmds = hUsers.filter((u) => cmdSquadByUser.has(u.id));
    const squadCmdIds = new Set(squadCmds.map((u) => u.id));
    const reps = hUsers.filter((u) => !squadCmdIds.has(u.id));
    const takenSquadIds = new Set(squadCmds.map((u) => cmdSquadByUser.get(u.id)!));

    // מבנה פיקוד (רק לפלוגות) — נבנה מתפקידי החיילים: מפקד ללא מחלקה = מפ/ס.מפ; מפקד עם מחלקה = מ"מ.
    const compSoldiers = allSoldiers.filter((s) => s.companyId === h.id);
    const commanders = compSoldiers
      .filter((s) => s.companyRole?.isCommander && !s.squadId)
      .sort((a, b) => (a.companyRole!.sortOrder - b.companyRole!.sortOrder))
      .map((s) => ({ name: s.fullName, role: s.companyRole!.name }));
    const squadStruct = (squads as { id: string; name: string; companyId: string }[])
      .filter((sq) => sq.companyId === h.id)
      .map((sq) => {
        const members = compSoldiers.filter((s) => s.squadId === sq.id);
        const leader = members.find((s) => s.companyRole?.isCommander);
        return {
          name: sq.name,
          leader: leader ? { name: leader.fullName, role: leader.companyRole!.name } : null,
          memberCount: members.length,
        };
      });
    const hierarchy = h.kind === "COMPANY"
      ? { commanders, squads: squadStruct, total: compSoldiers.length }
      : null;

    return {
      id: h.id,
      kind: h.kind,
      name: h.name,
      cap: h.delegateCap ?? defaultCap,
      capIsDefault: h.delegateCap == null,
      hierarchy,
      subUsers: reps.map((u) => ({
        id: u.id, username: u.username, fullName: u.fullName, phone: u.phone,
        passwordSet: u.passwordSet, inviteToken: u.inviteToken, telegramLinked: !!u.soldier?.telegramChatId,
        area: u.systemRole?.name ?? "כללי",
      })),
      squadCommanders: squadCmds.map((u) => ({
        id: u.id, username: u.username, fullName: u.fullName, phone: u.phone,
        passwordSet: u.passwordSet, inviteToken: u.inviteToken, telegramLinked: !!u.soldier?.telegramChatId,
        squadName: squadNameById.get(cmdSquadByUser.get(u.id)!) ?? "—",
      })),
      // מחלקות פנויות (ללא מפקד פעיל)
      squads: (squads as { id: string; name: string; companyId: string }[])
        .filter((s) => s.companyId === h.id && !takenSquadIds.has(s.id))
        .map((s) => ({ id: s.id, name: s.name })),
      // פלוגה → חיילי הפלוגה; מחסן → כל חיילי הגדוד (למחסן אין חיילים משויכים). ללא חיילים שכבר מקושרים למשתמש.
      soldiers: (soldiers as { id: string; fullName: string; companyId: string | null; squadId: string | null; telegramChatId: string | null }[])
        .filter((s) => (h.kind === "WAREHOUSE" ? true : s.companyId === h.id) && !linkedSet.has(s.id))
        .map((s) => ({ id: s.id, fullName: s.fullName, squadId: s.squadId, telegramLinked: !!s.telegramChatId })),
    };
  });

  return (
    <div>
      <PageHeader
        helpKey="team"
        title="🎖️ מטה ומפל״ג"
        subtitle={isAdmin ? "מבנה הפיקוד — מפ, ס.מפ, מ״מים ורספ״ים לפי מחלקות" : "מבנה הפיקוד והאצלת הרשאות — עם הזמנה בטלגרם"}
      />
      <PeopleTabs active="team" />
      {data.length === 0 ? (
        <Card className="p-6 text-center text-slate-400 text-sm">
          אינך מנהל יחידה (פלוגה/מחסן) שאפשר למנות אליה צוות. אם זו טעות — פנה למנהל המערכת.
        </Card>
      ) : (
        <TeamClient holders={data} baseUrl={baseUrl} isAdmin={isAdmin} defaultCap={defaultCap} />
      )}
    </div>
  );
}
