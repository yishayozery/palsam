import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import type { RequestType } from "@/generated/prisma";
import RequestsClient from "./RequestsClient";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const user = await requireUser();
  const bId = user.battalionId!;
  const unit = await prisma.battalion.findUnique({
    where: { id: bId },
    select: { id: true, name: true, level: true, parentId: true, parent: { select: { name: true } } },
  });
  const isBrigade = unit?.level === "BRIGADE";
  const isMalka = user.isAdmin || can(user, "battalion.profile");

  // בעל תפקיד בחטיבה — רואה רק את הסוגים שהוקצו לו. מלכ"א/גדוד — הכל.
  let myTypes: RequestType[] | null = null;
  if (isBrigade && !isMalka) {
    const handlers = await prisma.requestTypeHandler.findMany({ where: { brigadeUnitId: bId, userId: user.id }, select: { type: true } });
    myTypes = [...new Set(handlers.map((h) => h.type))];
  }

  const requests = await prisma.request.findMany({
    where: isBrigade ? { targetUnitId: bId, ...(myTypes ? { type: { in: myTypes } } : {}) } : { battalionId: bId },
    include: {
      battalion: { select: { name: true } },
      updates: { orderBy: { createdAt: "asc" }, select: { id: true, authorName: true, text: true, statusFrom: true, statusTo: true, createdAt: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 300,
  });

  const rows = requests.map((r) => ({
    id: r.id, type: r.type, title: r.title, description: r.description, priority: r.priority, status: r.status,
    openerName: r.battalion.name, openedByName: r.openedByName, assignedName: r.assignedName,
    createdAt: r.createdAt.toISOString(), escalatedAt: r.escalatedAt?.toISOString() ?? null,
    updates: r.updates.map((u) => ({ id: u.id, authorName: u.authorName, text: u.text, statusFrom: u.statusFrom, statusTo: u.statusTo, createdAt: u.createdAt.toISOString() })),
  }));

  const companies = isBrigade ? [] : await prisma.holder.findMany({
    where: { battalionId: bId, kind: "COMPANY", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" },
  });

  // הגדרות בעלי-תפקיד — רק למלכ"א בחטיבה
  const brigadeUsers = isBrigade && isMalka
    ? await prisma.appUser.findMany({ where: { battalionId: bId, active: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } })
    : [];
  const handlers = isBrigade && isMalka
    ? await prisma.requestTypeHandler.findMany({ where: { brigadeUnitId: bId }, select: { id: true, type: true, userId: true } })
    : [];

  return (
    <RequestsClient
      mode={isBrigade ? "brigade" : "battalion"}
      unitName={unit?.name ?? ""}
      parentName={unit?.parent?.name ?? null}
      isCommander={isMalka}
      isMalka={isBrigade && isMalka}
      myTypes={myTypes}
      companies={companies}
      requests={rows}
      brigadeUsers={brigadeUsers.map((u) => ({ id: u.id, name: u.fullName ?? "—" }))}
      handlers={handlers}
    />
  );
}
