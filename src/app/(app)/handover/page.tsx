import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import HandoverClient from "./HandoverClient";

export const dynamic = "force-dynamic";

export default async function HandoverPage() {
  const user = await requireUser();
  if (!can(user, "attendance.manage") && !can(user, "company.manage")) redirect("/");
  const bId = user.battalionId!;

  const isCR = user.role === "COMPANY_REP" && !!user.holderId;
  const companyWhere = isCR ? { id: user.holderId! } : { battalionId: bId, kind: "COMPANY" as const, active: true };

  const [companies, handovers] = await Promise.all([
    prisma.holder.findMany({ where: companyWhere, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.shiftHandover.findMany({
      where: { battalionId: bId, ...(isCR ? { companyId: user.holderId! } : {}) },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        company: { select: { name: true } },
        items: { orderBy: { sortOrder: "asc" }, select: { id: true, category: true, label: true, done: true } },
      },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="🔄 העברת משמרת"
        subtitle="צ'ק ליסט להעברת משמרת בין סבבים — בדגש על העברת חתימות וציוד. הרשימה נבנית אוטומטית ממצב הפלוגה."
      />
      <HandoverClient
        companies={companies}
        handovers={handovers.map((h) => ({
          id: h.id,
          companyName: h.company.name,
          fromRound: h.fromRound,
          toRound: h.toRound,
          title: h.title,
          status: h.status,
          createdAt: h.createdAt.toISOString(),
          items: h.items,
        }))}
      />
    </div>
  );
}
