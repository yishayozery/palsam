import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { signLink } from "@/lib/link-token";
import { ensureArmoryChecklist } from "@/lib/armoryInspection";
import InspectionsClient from "./InspectionsClient";

export const dynamic = "force-dynamic";

export default async function ArmoryInspectionsPage() {
  const user = await requireUser();
  if (!can(user, "armory") && !can(user, "signatures.manage") && !user.isAdmin) redirect("/dashboard");
  const bId = user.battalionId!;
  await ensureArmoryChecklist(bId);

  const [inspections, checklist, soldiers, armories] = await Promise.all([
    prisma.armoryInspection.findMany({
      where: { battalionId: bId },
      include: { items: { select: { ok: true } } },
      orderBy: { scheduledAt: "desc" },
      take: 100,
    }),
    prisma.armoryChecklistItem.findMany({ where: { battalionId: bId }, orderBy: { sortOrder: "asc" } }),
    prisma.soldier.findMany({ where: { battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    prisma.holder.findMany({ where: { battalionId: bId, warehouseType: "ARMORY", active: true }, select: { id: true, name: true } }),
  ]);

  // שמות בודקים/מחסנים
  const solMap = new Map(soldiers.map((s) => [s.id, s.fullName]));
  const holderMap = new Map(armories.map((h) => [h.id, h.name]));

  const rows = inspections.map((i) => ({
    id: i.id,
    scheduledAt: i.scheduledAt.toISOString(),
    inspectorName: i.inspectorName ?? (i.inspectorSoldierId ? solMap.get(i.inspectorSoldierId) ?? "—" : "—"),
    holderName: i.holderId ? holderMap.get(i.holderId) ?? "" : "",
    status: i.status,
    overallOk: i.overallOk,
    completedAt: i.completedAt?.toISOString() ?? null,
    total: i.items.length,
    faults: i.items.filter((it) => it.ok === false).length,
    // לינק מאובטח לצפייה/מילוי (למנהל — לשליחה/הדפסה)
    link: `/armory-inspection/${i.id}?t=${signLink("armory-inspection", i.id)}`,
  }));

  return (
    <InspectionsClient
      inspections={rows}
      checklist={checklist.map((c) => ({ id: c.id, label: c.label, active: c.active }))}
      soldiers={soldiers}
      armories={armories}
    />
  );
}
