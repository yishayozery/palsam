import { requireUser } from "@/lib/guard";
import { can, canEdit } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import PeopleTabs from "@/components/PeopleTabs";
import CrudSection from "@/components/CrudSection";
import { saveCertificationType, toggleCertificationType } from "./actions";

export const dynamic = "force-dynamic";

export default async function CertificationsPage() {
  const user = await requireUser();
  const canView = can(user, "certifications");
  if (!canView) redirect("/dashboard");
  const bId = user.battalionId!;

  const canManageTypes = canEdit(user, "certifications");

  const certTypes = await prisma.certificationType.findMany({
    where: { battalionId: bId, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { soldiers: true } } },
  });

  return (
    <div>
      <PageHeader
        title="🏅 סוגי הסמכות"
        subtitle="הגדרת סוגי ההסמכות בגדוד (מטוליסט, נגב, חובש…). ההצמדה לחיילים מתבצעת במסך חיילים."
      />
      <PeopleTabs active="certifications" />

      <Card className="p-3 mb-4 bg-blue-50 border-blue-200 text-xs text-blue-900">
        💡 כאן מגדירים רק את <b>רשימת סוגי ההסמכות</b>. כדי לשייך הסמכה לחייל — עבור למסך <b>חיילי הפלוגה</b> ולחץ על תא ה״הסמכות״ ליד החייל.
      </Card>

      {canManageTypes ? (
        <CrudSection
          title="סוגי הסמכות"
          addLabel="סוג הסמכה"
          fields={[{ name: "name", label: "שם (למשל: חובש, נהג נגמ\"ש, מ\"כ)" }]}
          saveAction={saveCertificationType}
          deleteAction={toggleCertificationType}
          rows={certTypes.map((ct) => ({
            id: ct.id,
            values: { name: ct.name },
            display: (
              <span className="flex items-center gap-2">
                <span className="font-medium">{ct.name}</span>
                <span className="text-[11px] text-slate-400">· {ct._count.soldiers} חיילים</span>
              </span>
            ),
          }))}
        />
      ) : (
        <div className="space-y-2">
          {certTypes.map((ct) => (
            <Card key={ct.id} className="px-4 py-2.5 flex items-center gap-2">
              <span className="font-medium">{ct.name}</span>
              <span className="text-[11px] text-slate-400">· {ct._count.soldiers} חיילים</span>
            </Card>
          ))}
          {certTypes.length === 0 && <div className="text-sm text-slate-400 p-4">לא הוגדרו סוגי הסמכות.</div>}
        </div>
      )}
    </div>
  );
}
