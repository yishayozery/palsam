import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import DutyClient from "./DutyClient";

export const dynamic = "force-dynamic";

export default async function DutyPage({ searchParams }: { searchParams: Promise<{ board?: string }> }) {
  const user = await requireUser();
  const bId = user.battalionId!;
  const isManager = user.isAdmin || can(user, "battalion.profile");
  const sp = await searchParams;

  const [companies, squads, soldiers, meLink] = await Promise.all([
    prisma.holder.findMany({ where: { battalionId: bId, kind: "COMPANY", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.squad.findMany({ where: { battalionId: bId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.soldier.findMany({ where: { battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    prisma.appUser.findUnique({ where: { id: user.id }, select: { soldierId: true } }),
  ]);
  const mySoldierId = meLink?.soldierId ?? null;
  const nameById = new Map(soldiers.map((s) => [s.id, s.fullName]));
  const holderName = new Map(companies.map((h) => [h.id, h.name]));
  const squadName = new Map(squads.map((s) => [s.id, s.name]));

  const boards = await prisma.dutyBoard.findMany({
    where: {
      battalionId: bId, active: true,
      ...(isManager ? {} : { OR: [{ visibility: "ALL" as const }, { createdById: user.id }, { viewers: { some: { userId: user.id } } }] }),
    },
    select: { id: true, name: true, visibility: true, fromDate: true, toDate: true, createdById: true, createdByName: true, _count: { select: { slots: true } } },
    orderBy: { createdAt: "desc" },
  });

  const selectedId = sp.board && boards.some((b) => b.id === sp.board) ? sp.board : null;
  let detail = null;
  if (selectedId) {
    const b = await prisma.dutyBoard.findUnique({
      where: { id: selectedId },
      select: {
        id: true, name: true, defaultStart: true, defaultEnd: true, notes: true, createdById: true,
        visibility: true, fromDate: true, toDate: true, allowSelfSchedule: true,
        slots: {
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
          select: { id: true, date: true, startTime: true, endTime: true, label: true, capacity: true, companyId: true, squadId: true, responsibleSoldierId: true, assignments: { select: { id: true, soldierId: true } } },
        },
      },
    });
    if (b) {
      detail = {
        id: b.id, name: b.name, defaultStart: b.defaultStart, defaultEnd: b.defaultEnd, notes: b.notes,
        visibility: b.visibility, fromDate: b.fromDate?.toISOString().slice(0, 10) ?? null, toDate: b.toDate?.toISOString().slice(0, 10) ?? null,
        allowSelfSchedule: b.allowSelfSchedule,
        canManage: b.createdById === user.id || isManager,
        slots: b.slots.map((s) => ({
          id: s.id, date: s.date.toISOString().slice(0, 10), startTime: s.startTime, endTime: s.endTime, label: s.label, capacity: s.capacity,
          companyName: s.companyId ? holderName.get(s.companyId) ?? null : null,
          squadName: s.squadId ? squadName.get(s.squadId) ?? null : null,
          responsibleName: s.responsibleSoldierId ? nameById.get(s.responsibleSoldierId) ?? null : null,
          canFill: b.createdById === user.id || isManager || (!!mySoldierId && mySoldierId === s.responsibleSoldierId),
          assignments: s.assignments.map((a) => ({ id: a.id, name: nameById.get(a.soldierId) ?? "—" })),
        })),
      };
    }
  }

  return (
    <DutyClient
      isManager={isManager}
      boards={boards.map((b) => ({ id: b.id, name: b.name, visibility: b.visibility, fromDate: b.fromDate?.toISOString().slice(0, 10) ?? null, toDate: b.toDate?.toISOString().slice(0, 10) ?? null, createdByName: b.createdByName, slotCount: b._count.slots, canManage: b.createdById === user.id || isManager }))}
      detail={detail}
      companies={companies}
      squads={squads}
      soldiers={soldiers.map((s) => ({ id: s.id, name: s.fullName }))}
    />
  );
}
