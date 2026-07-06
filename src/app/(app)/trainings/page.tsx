import { requireUser } from "@/lib/guard";
import { can, canEdit } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import TrainingsClient from "./TrainingsClient";

export const dynamic = "force-dynamic";

export default async function TrainingsPage() {
  const user = await requireUser();
  if (!can(user, "trainings") && !can(user, "soldiers") && !user.isAdmin) redirect("/dashboard");
  const bId = user.battalionId!;

  const canManage = user.isAdmin || user.isSuperAdmin || canEdit(user, "trainings");
  const canEnroll = canManage || canEdit(user, "soldiers");

  // scope: מפ (holder פלוגה) רואה את הפלוגה שלו; אדמין/קה"ד רואים הכל
  const companies = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "COMPANY", active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const isCompanyHolder = user.holderId ? companies.some((c) => c.id === user.holderId) : false;
  const myCompanyId = isCompanyHolder ? user.holderId! : null;
  const soldierWhere = myCompanyId ? { companyId: myCompanyId } : {};

  const [courseTypes, instances, requests, soldiers, certTypes, licenseTypes] = await Promise.all([
    prisma.courseType.findMany({
      where: { battalionId: bId, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { quals: true, _count: { select: { instances: true } } },
    }),
    prisma.courseInstance.findMany({
      where: { battalionId: bId, active: true },
      orderBy: [{ startDate: "asc" }, { createdAt: "desc" }],
      include: {
        courseType: { select: { name: true } },
        allocations: true,
        enrollments: { include: { soldier: { select: { fullName: true, companyId: true, company: { select: { name: true } } } } } },
      },
    }),
    prisma.courseRequest.findMany({
      where: { battalionId: bId, status: { in: ["PENDING", "APPROVED"] } },
      orderBy: { requestedAt: "desc" },
      include: {
        courseType: { select: { name: true } },
        soldier: { select: { fullName: true, company: { select: { name: true } } } },
        company: { select: { name: true } },
      },
    }),
    prisma.soldier.findMany({
      where: { battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] }, ...soldierWhere },
      orderBy: [{ company: { name: "asc" } }, { fullName: "asc" }],
      select: {
        id: true, fullName: true, companyId: true,
        company: { select: { name: true } }, squad: { select: { name: true } },
        certifications: { select: { certificationTypeId: true } },
        drivingLicenses: { select: { licenseTypeId: true } },
      },
    }),
    prisma.certificationType.findMany({ where: { battalionId: bId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.drivingLicenseType.findMany({ where: { battalionId: bId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div>
      <PageHeader
        helpKey="trainings"
        title="🎓 הדרכות וקורסים"
        subtitle={canManage ? "קטלוג קורסים, מופעים, מכסות לפלוגות ושיבוץ חיילים" : "מופעי קורסים — שיבוץ חיילים ובקשות"}
      />
      <TrainingsClient
        canManage={canManage}
        canEnroll={canEnroll}
        myCompanyId={myCompanyId}
        companies={companies}
        certTypes={certTypes}
        licenseTypes={licenseTypes}
        courseTypes={courseTypes.map((ct) => ({
          id: ct.id, name: ct.name, description: ct.description, active: ct.active,
          instanceCount: ct._count.instances,
          prereqCerts: ct.quals.filter((q) => q.role === "PREREQ" && q.certificationTypeId).map((q) => q.certificationTypeId!),
          prereqLicenses: ct.quals.filter((q) => q.role === "PREREQ" && q.drivingLicenseTypeId).map((q) => q.drivingLicenseTypeId!),
          grantCerts: ct.quals.filter((q) => q.role === "GRANT" && q.certificationTypeId).map((q) => q.certificationTypeId!),
          grantLicenses: ct.quals.filter((q) => q.role === "GRANT" && q.drivingLicenseTypeId).map((q) => q.drivingLicenseTypeId!),
        }))}
        instances={instances.map((i) => ({
          id: i.id, courseTypeId: i.courseTypeId, courseName: i.courseType.name,
          location: i.location, startDate: i.startDate ? i.startDate.toISOString() : null,
          hours: i.hours, bringItems: i.bringItems, contactName: i.contactName, contactPhone: i.contactPhone,
          totalSlots: i.totalSlots, notes: i.notes, status: i.status,
          allocations: i.allocations.map((a) => ({ companyId: a.companyId, slots: a.slots })),
          enrollments: i.enrollments.map((e) => ({
            id: e.id, soldierId: e.soldierId, soldierName: e.soldier.fullName,
            companyId: e.soldier.companyId, companyName: e.soldier.company?.name ?? null, status: e.status,
          })),
        }))}
        requests={requests.map((r) => ({
          id: r.id, courseTypeId: r.courseTypeId, courseName: r.courseType.name,
          soldierId: r.soldierId, soldierName: r.soldier?.fullName ?? null,
          companyName: r.company?.name ?? r.soldier?.company?.name ?? null,
          note: r.note, status: r.status, requestedAt: r.requestedAt.toISOString(),
        }))}
        soldiers={soldiers.map((s) => ({
          id: s.id, fullName: s.fullName, companyId: s.companyId,
          companyName: s.company?.name ?? null, squadName: s.squad?.name ?? null,
          certIds: s.certifications.map((c) => c.certificationTypeId),
          licenseIds: s.drivingLicenses.map((l) => l.licenseTypeId),
        }))}
      />
    </div>
  );
}
