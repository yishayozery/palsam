import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import CrudSection from "@/components/CrudSection";
import { saveCertificationType, toggleCertificationType } from "./actions";
import CertificationEditor from "./CertificationEditor";

export const dynamic = "force-dynamic";

export default async function CertificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "dispatch.manage")) redirect("/dashboard");
  const bId = user.battalionId!;
  const { tab = "soldiers" } = await searchParams;

  const canManageTypes = can(user, "battalion.profile") || user.role === "WAREHOUSE_MANAGER";
  const canEditCerts = canManageTypes || can(user, "dispatch.manage");

  const [certTypes, soldiers, companies] = await Promise.all([
    prisma.certificationType.findMany({
      where: { battalionId: bId, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.soldier.findMany({
      where: { battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] } },
      orderBy: [{ company: { name: "asc" } }, { fullName: "asc" }],
      include: {
        company: { select: { name: true } },
        squad: { select: { name: true } },
        certifications: { select: { certificationTypeId: true } },
      },
    }),
    prisma.holder.findMany({
      where: { battalionId: bId, kind: "COMPANY", active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const TABS = [
    { key: "soldiers", label: "הסמכות פר חייל" },
    { key: "types", label: "סוגי הסמכות" },
  ] as const;

  return (
    <div>
      <PageHeader
        title="הסמכות"
        subtitle={`${soldiers.length} חיילים · ${certTypes.length} סוגי הסמכות`}
      />

      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {TABS.map((t) => (
          <a
            key={t.key}
            href={`?tab=${t.key}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              tab === t.key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </a>
        ))}
      </div>

      {tab === "types" && canManageTypes && (
        <CrudSection
          title="סוגי הסמכות"
          addLabel="סוג הסמכה"
          fields={[{ name: "name", label: "שם (למשל: חובש, נהג נגמ\"ש, מ\"כ)" }]}
          saveAction={saveCertificationType}
          deleteAction={toggleCertificationType}
          rows={certTypes.map((ct) => ({
            id: ct.id,
            values: { name: ct.name },
            display: <span className="font-medium">{ct.name}</span>,
          }))}
        />
      )}

      {tab === "soldiers" && (
        <CertificationEditor
          soldiers={soldiers.map((s) => ({
            id: s.id,
            fullName: s.fullName,
            companyId: s.companyId,
            companyName: s.company?.name ?? null,
            squadName: s.squad?.name ?? null,
            certifications: s.certifications.map((c) => c.certificationTypeId),
          }))}
          certTypes={certTypes.map((ct) => ({ id: ct.id, name: ct.name }))}
          companies={companies.map((c) => ({ id: c.id, name: c.name }))}
          canEdit={canEditCerts}
        />
      )}
    </div>
  );
}
