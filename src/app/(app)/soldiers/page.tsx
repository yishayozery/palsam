import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge } from "@/components/ui";
import CrudSection from "@/components/CrudSection";
import ImportExcel from "@/components/ImportExcel";
import { saveSoldier, toggleSoldier } from "./actions";
import { importSoldiers } from "./import-actions";

export const dynamic = "force-dynamic";

export default async function SoldiersPage() {
  const user = await requireCapability("company.manage");
  const bId = user.battalionId!;

  // נציג פלוגה רואה רק את חיילי הפלוגה שלו
  const where = { battalionId: bId, ...(user.holderId ? { companyId: user.holderId } : {}) };
  const [soldiers, companies] = await Promise.all([
    prisma.soldier.findMany({
      where,
      orderBy: [{ platoon: "asc" }, { fullName: "asc" }],
      include: {
        company: true,
        _count: { select: { signedSerialUnits: true, signedKitInstances: true } },
      },
    }),
    prisma.holder.findMany({ where: { battalionId: bId, kind: "COMPANY", active: true }, orderBy: { name: "asc" } }),
  ]);

  const fields = [
    { name: "fullName", label: "שם מלא" },
    { name: "personalNumber", label: "מספר אישי" },
    { name: "phone", label: "טלפון" },
    { name: "platoon", label: "מחלקה" },
    ...(user.holderId
      ? []
      : [{
          name: "companyId",
          label: "פלוגה",
          type: "select" as const,
          options: companies.map((c) => ({ value: c.id, label: c.name })),
        }]),
  ];

  return (
    <div>
      <PageHeader
        title="חיילים"
        subtitle="משתמשי קצה — ללא יוזרים במערכת"
        action={<ImportExcel action={importSoldiers} templateHref="/soldiers/template" label="ייבוא חיילים" />}
      />
      <CrudSection
        title="רשימת חיילים"
        addLabel="חייל"
        fields={fields}
        saveAction={saveSoldier}
        deleteAction={toggleSoldier}
        rows={soldiers.map((s) => ({
          id: s.id,
          values: {
            fullName: s.fullName,
            personalNumber: s.personalNumber ?? "",
            phone: s.phone ?? "",
            platoon: s.platoon ?? "",
            companyId: s.companyId ?? "",
          },
          display: (
            <span className="flex items-center gap-2">
              <span className="font-medium">{s.fullName}</span>
              <span className="font-mono text-xs text-slate-400">{s.personalNumber}</span>
              {s.platoon && <Badge className="bg-indigo-100 text-indigo-700">מחלקה {s.platoon}</Badge>}
              {s.company && <Badge>{s.company.name}</Badge>}
              {s._count.signedSerialUnits + s._count.signedKitInstances > 0 && (
                <Badge className="bg-blue-100 text-blue-700">
                  חתום על {s._count.signedSerialUnits + s._count.signedKitInstances}
                </Badge>
              )}
              {!s.active && <Badge className="bg-rose-100 text-rose-700">לא פעיל</Badge>}
            </span>
          ),
        }))}
      />
    </div>
  );
}
