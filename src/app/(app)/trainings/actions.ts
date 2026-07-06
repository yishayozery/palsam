"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";

// ניהול קורסים (קטלוג + מופעים + הקצאות) = קה"ד/אדמין
function canManage(user: SessionUser): boolean {
  return user.isAdmin || user.isSuperAdmin || canEdit(user, "trainings");
}
// שיבוץ/בקשות = מי שמנהל חיילים (מפ/מפקד מחלקה) או קה"ד/אדמין
function canEnroll(user: SessionUser): boolean {
  return canManage(user) || canEdit(user, "soldiers");
}

function parseDate(v: string): Date | null {
  const s = v.trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ===================== זריעת קטלוג ברירת מחדל =====================

const DEFAULT_CATALOG: { name: string; prereqLic?: string[]; grantCert?: string[]; grantLic?: string[] }[] = [
  { name: "מלגזה", grantCert: ["מפעיל מלגזה"] },
  { name: "אושקוש מנוף", grantCert: ["מפעיל מנוף אושקוש"] },
  { name: "האמר מפקדה", grantLic: ["האמר מפקדה"] },
  { name: "האמר מוגן", grantLic: ["האמר מוגן"] },
  { name: "רישיון C", prereqLic: ["B"], grantLic: ["C"] },
  { name: "רחפן אווטר", grantCert: ["מפעיל רחפן אווטר"] },
];

export async function seedDefaultCourseCatalog() {
  const user = await requireUser();
  if (!canManage(user)) return;
  const bId = user.battalionId!;

  async function certId(name: string) {
    return (await prisma.certificationType.upsert({ where: { battalionId_name: { battalionId: bId, name } }, update: { active: true }, create: { battalionId: bId, name } })).id;
  }
  async function licId(name: string) {
    return (await prisma.drivingLicenseType.upsert({ where: { battalionId_name: { battalionId: bId, name } }, update: { active: true }, create: { battalionId: bId, name } })).id;
  }

  for (const d of DEFAULT_CATALOG) {
    const quals: { role: "PREREQ" | "GRANT"; certificationTypeId: string | null; drivingLicenseTypeId: string | null }[] = [];
    for (const l of d.prereqLic ?? []) quals.push({ role: "PREREQ", certificationTypeId: null, drivingLicenseTypeId: await licId(l) });
    for (const c of d.grantCert ?? []) quals.push({ role: "GRANT", certificationTypeId: await certId(c), drivingLicenseTypeId: null });
    for (const l of d.grantLic ?? []) quals.push({ role: "GRANT", certificationTypeId: null, drivingLicenseTypeId: await licId(l) });

    const existing = await prisma.courseType.findFirst({ where: { battalionId: bId, name: d.name } });
    const ct = existing
      ? await prisma.courseType.update({ where: { id: existing.id }, data: { active: true } })
      : await prisma.courseType.create({ data: { battalionId: bId, name: d.name } });
    await prisma.courseTypeQualification.deleteMany({ where: { courseTypeId: ct.id } });
    if (quals.length) await prisma.courseTypeQualification.createMany({ data: quals.map((q) => ({ ...q, courseTypeId: ct.id })) });
  }
  await audit(user.id, "SEED", "CourseType", "default-catalog");
  revalidatePath("/trainings");
}

// ===================== קטלוג סוגי קורס =====================

export async function saveCourseType(formData: FormData): Promise<string | undefined> {
  const user = await requireUser();
  if (!canManage(user)) return "אין הרשאה לנהל קורסים";
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  if (!name) return "שם הקורס הוא שדה חובה";

  const prereqCert = formData.getAll("prereqCert").map(String).filter(Boolean);
  const prereqLicense = formData.getAll("prereqLicense").map(String).filter(Boolean);
  const grantCert = formData.getAll("grantCert").map(String).filter(Boolean);
  const grantLicense = formData.getAll("grantLicense").map(String).filter(Boolean);

  const quals = [
    ...prereqCert.map((c) => ({ role: "PREREQ" as const, certificationTypeId: c, drivingLicenseTypeId: null })),
    ...prereqLicense.map((l) => ({ role: "PREREQ" as const, certificationTypeId: null, drivingLicenseTypeId: l })),
    ...grantCert.map((c) => ({ role: "GRANT" as const, certificationTypeId: c, drivingLicenseTypeId: null })),
    ...grantLicense.map((l) => ({ role: "GRANT" as const, certificationTypeId: null, drivingLicenseTypeId: l })),
  ];

  const dup = await prisma.courseType.findFirst({ where: { battalionId: bId, name, ...(id ? { id: { not: id } } : {}) } });
  if (dup) return `קורס בשם "${name}" כבר קיים`;

  await prisma.$transaction(async (tx) => {
    let typeId = id;
    if (id) {
      const existing = await tx.courseType.findUnique({ where: { id } });
      if (!existing || existing.battalionId !== bId) throw new Error("not found");
      await tx.courseType.update({ where: { id }, data: { name, description } });
      await tx.courseTypeQualification.deleteMany({ where: { courseTypeId: id } });
    } else {
      const created = await tx.courseType.create({ data: { battalionId: bId, name, description } });
      typeId = created.id;
    }
    if (quals.length > 0) {
      await tx.courseTypeQualification.createMany({ data: quals.map((q) => ({ ...q, courseTypeId: typeId })) });
    }
  });
  await audit(user.id, id ? "UPDATE" : "CREATE", "CourseType", id || name);
  revalidatePath("/trainings");
}

export async function toggleCourseType(formData: FormData) {
  const user = await requireUser();
  if (!canManage(user)) return;
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const ct = await prisma.courseType.findUnique({ where: { id } });
  if (!ct || ct.battalionId !== bId) return;
  await prisma.courseType.update({ where: { id }, data: { active: !ct.active } });
  await audit(user.id, "TOGGLE", "CourseType", id);
  revalidatePath("/trainings");
}

// ===================== מופעים =====================

export async function saveCourseInstance(formData: FormData): Promise<string | undefined> {
  const user = await requireUser();
  if (!canManage(user)) return "אין הרשאה לנהל מופעים";
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const courseTypeId = String(formData.get("courseTypeId") || "");
  if (!courseTypeId) return "יש לבחור סוג קורס";
  const ct = await prisma.courseType.findUnique({ where: { id: courseTypeId } });
  if (!ct || ct.battalionId !== bId) return "סוג קורס לא תקין";

  const data = {
    courseTypeId,
    location: String(formData.get("location") || "").trim() || null,
    startDate: parseDate(String(formData.get("startDate") || "")),
    hours: String(formData.get("hours") || "").trim() || null,
    bringItems: String(formData.get("bringItems") || "").trim() || null,
    contactName: String(formData.get("contactName") || "").trim() || null,
    contactPhone: String(formData.get("contactPhone") || "").trim() || null,
    totalSlots: formData.get("totalSlots") ? parseInt(String(formData.get("totalSlots")), 10) || null : null,
    notes: String(formData.get("notes") || "").trim() || null,
  };

  if (id) {
    const existing = await prisma.courseInstance.findUnique({ where: { id } });
    if (!existing || existing.battalionId !== bId) return "מופע לא נמצא";
    await prisma.courseInstance.update({ where: { id }, data });
  } else {
    await prisma.courseInstance.create({ data: { ...data, battalionId: bId, createdById: user.id } });
  }
  await audit(user.id, id ? "UPDATE" : "CREATE", "CourseInstance", id || courseTypeId);
  revalidatePath("/trainings");
}

export async function setCourseInstanceStatus(formData: FormData) {
  const user = await requireUser();
  if (!canManage(user)) return;
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!["OPEN", "CLOSED", "DONE"].includes(status)) return;
  const inst = await prisma.courseInstance.findUnique({ where: { id } });
  if (!inst || inst.battalionId !== bId) return;
  await prisma.courseInstance.update({ where: { id }, data: { status: status as "OPEN" | "CLOSED" | "DONE" } });
  await audit(user.id, "STATUS", "CourseInstance", id, { status });
  revalidatePath("/trainings");
}

export async function deleteCourseInstance(formData: FormData) {
  const user = await requireUser();
  if (!canManage(user)) return;
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const inst = await prisma.courseInstance.findUnique({ where: { id } });
  if (!inst || inst.battalionId !== bId) return;
  await prisma.courseInstance.update({ where: { id }, data: { active: false } });
  await audit(user.id, "DELETE", "CourseInstance", id);
  revalidatePath("/trainings");
}

// הקצאת מכסות פר-פלוגה: שדות alloc_<companyId> = מספר
export async function setCourseAllocations(formData: FormData) {
  const user = await requireUser();
  if (!canManage(user)) return;
  const bId = user.battalionId!;
  const instanceId = String(formData.get("instanceId") || "");
  const inst = await prisma.courseInstance.findUnique({ where: { id: instanceId } });
  if (!inst || inst.battalionId !== bId) return;

  const companies = await prisma.holder.findMany({ where: { battalionId: bId, kind: "COMPANY", active: true }, select: { id: true } });
  await prisma.$transaction(async (tx) => {
    for (const c of companies) {
      const raw = formData.get(`alloc_${c.id}`);
      const slots = raw != null ? Math.max(0, parseInt(String(raw), 10) || 0) : 0;
      if (slots > 0) {
        await tx.courseAllocation.upsert({
          where: { courseInstanceId_companyId: { courseInstanceId: instanceId, companyId: c.id } },
          update: { slots },
          create: { courseInstanceId: instanceId, companyId: c.id, slots },
        });
      } else {
        await tx.courseAllocation.deleteMany({ where: { courseInstanceId: instanceId, companyId: c.id } });
      }
    }
  });
  await audit(user.id, "ALLOCATE", "CourseInstance", instanceId);
  revalidatePath("/trainings");
}

// ===================== שיבוץ =====================

export async function enrollSoldier(formData: FormData): Promise<string | undefined> {
  const user = await requireUser();
  if (!canEnroll(user)) return "אין הרשאה לשבץ";
  const bId = user.battalionId!;
  const instanceId = String(formData.get("instanceId") || "");
  const soldierId = String(formData.get("soldierId") || "");
  if (!instanceId || !soldierId) return "חסרים נתונים";

  const [inst, soldier] = await Promise.all([
    prisma.courseInstance.findUnique({ where: { id: instanceId }, include: { allocations: true, _count: { select: { enrollments: true } } } }),
    prisma.soldier.findUnique({ where: { id: soldierId }, select: { battalionId: true, companyId: true, fullName: true } }),
  ]);
  if (!inst || inst.battalionId !== bId) return "מופע לא נמצא";
  if (!soldier || soldier.battalionId !== bId) return "חייל לא נמצא";
  if (inst.status !== "OPEN") return "המופע סגור לשיבוץ";

  // scope: מפ/מפקד מחלקה משבצים רק מהפלוגה שלהם. אדמין/קה"ד — כל אחד.
  if (!canManage(user) && user.holderId && soldier.companyId !== user.holderId) {
    return "אפשר לשבץ רק חיילים מהפלוגה שלך";
  }

  // בדיקת כפילות
  const dup = await prisma.courseEnrollment.findUnique({ where: { courseInstanceId_soldierId: { courseInstanceId: instanceId, soldierId } } });
  if (dup) return "החייל כבר משובץ למופע זה";

  // מכסה כוללת
  if (inst.totalSlots != null && inst._count.enrollments >= inst.totalSlots) {
    return `המופע מלא (${inst.totalSlots} מקומות)`;
  }
  // מכסה פר-פלוגה (רק אם הוגדרה הקצאה לפלוגה)
  const alloc = inst.allocations.find((a) => a.companyId === soldier.companyId);
  if (alloc) {
    const compEnrolled = await prisma.courseEnrollment.count({
      where: { courseInstanceId: instanceId, soldier: { companyId: soldier.companyId } },
    });
    if (compEnrolled >= alloc.slots) return `הפלוגה מיצתה את המכסה (${alloc.slots})`;
  }

  await prisma.courseEnrollment.create({ data: { battalionId: bId, courseInstanceId: instanceId, soldierId, enrolledById: user.id } });
  // אם הייתה בקשה ממתינה — סמן כמתוזמנת
  await prisma.courseRequest.updateMany({
    where: { soldierId, courseTypeId: inst.courseTypeId, status: { in: ["PENDING", "APPROVED"] } },
    data: { status: "SCHEDULED", courseInstanceId: instanceId },
  });
  await audit(user.id, "ENROLL", "CourseInstance", instanceId, { soldierId });
  revalidatePath("/trainings");
}

export async function dropEnrollment(formData: FormData) {
  const user = await requireUser();
  if (!canEnroll(user)) return;
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const en = await prisma.courseEnrollment.findUnique({ where: { id }, include: { soldier: { select: { companyId: true } } } });
  if (!en || en.battalionId !== bId) return;
  if (!canManage(user) && user.holderId && en.soldier.companyId !== user.holderId) return;
  await prisma.courseEnrollment.delete({ where: { id } });
  await audit(user.id, "DROP", "CourseEnrollment", id);
  revalidatePath("/trainings");
}

// סימון סיום → הענקת ההסמכות/רישיונות שהקורס מקנה
export async function completeEnrollment(formData: FormData): Promise<string | undefined> {
  const user = await requireUser();
  if (!canManage(user)) return "רק קה\"ד/אדמין יכול לסמן סיום";
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const en = await prisma.courseEnrollment.findUnique({
    where: { id },
    include: { courseInstance: { include: { courseType: { include: { quals: true } } } } },
  });
  if (!en || en.battalionId !== bId) return "שיבוץ לא נמצא";

  const grants = en.courseInstance.courseType.quals.filter((q) => q.role === "GRANT");
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.courseEnrollment.update({ where: { id }, data: { status: "COMPLETED", completedAt: now } });
    for (const g of grants) {
      if (g.certificationTypeId) {
        await tx.soldierCertification.upsert({
          where: { soldierId_certificationTypeId: { soldierId: en.soldierId, certificationTypeId: g.certificationTypeId } },
          update: {},
          create: { soldierId: en.soldierId, certificationTypeId: g.certificationTypeId },
        });
      }
      if (g.drivingLicenseTypeId) {
        await tx.soldierDrivingLicense.upsert({
          where: { soldierId_licenseTypeId: { soldierId: en.soldierId, licenseTypeId: g.drivingLicenseTypeId } },
          update: {},
          create: { soldierId: en.soldierId, licenseTypeId: g.drivingLicenseTypeId },
        });
        // סיום קורס נהיגה = ריענון טרי
        await tx.soldier.update({ where: { id: en.soldierId }, data: { drivingRefresherDate: now } });
      }
    }
  });
  await audit(user.id, "COMPLETE", "CourseEnrollment", id, { grants: grants.length });
  revalidatePath("/trainings");
  revalidatePath("/soldiers");
  revalidatePath("/certifications");
  revalidatePath("/driving-licenses");
}

// ===================== בקשות =====================

export async function createCourseRequest(formData: FormData): Promise<string | undefined> {
  const user = await requireUser();
  if (!canEnroll(user)) return "אין הרשאה";
  const bId = user.battalionId!;
  const courseTypeId = String(formData.get("courseTypeId") || "");
  const soldierId = String(formData.get("soldierId") || "") || null;
  const courseInstanceId = String(formData.get("courseInstanceId") || "") || null;
  const note = String(formData.get("note") || "").trim() || null;
  if (!courseTypeId) return "יש לבחור סוג קורס";
  const ct = await prisma.courseType.findUnique({ where: { id: courseTypeId } });
  if (!ct || ct.battalionId !== bId) return "סוג קורס לא תקין";

  let companyId: string | null = null;
  if (soldierId) {
    const s = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { battalionId: true, companyId: true } });
    if (!s || s.battalionId !== bId) return "חייל לא נמצא";
    if (!canManage(user) && user.holderId && s.companyId !== user.holderId) return "אפשר לבקש רק לחיילי הפלוגה שלך";
    companyId = s.companyId;
  } else if (user.holderId) {
    companyId = user.holderId;
  }

  await prisma.courseRequest.create({
    data: { battalionId: bId, courseTypeId, soldierId, companyId, courseInstanceId, note, requestedById: user.id },
  });
  await audit(user.id, "REQUEST", "CourseType", courseTypeId, { soldierId });
  revalidatePath("/trainings");
}

export async function setRequestStatus(formData: FormData) {
  const user = await requireUser();
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!["PENDING", "APPROVED", "REJECTED", "SCHEDULED"].includes(status)) return;
  const req = await prisma.courseRequest.findUnique({ where: { id }, include: { soldier: { select: { companyId: true } } } });
  if (!req || req.battalionId !== bId) return;
  // אישור/דחייה = קה"ד/אדמין; מבקש יכול לבטל בקשה של הפלוגה שלו
  const isManage = canManage(user);
  if (!isManage) {
    if (status !== "REJECTED") return;
    if (user.holderId && req.companyId !== user.holderId) return;
  }
  await prisma.courseRequest.update({ where: { id }, data: { status: status as "PENDING" | "APPROVED" | "REJECTED" | "SCHEDULED" } });
  await audit(user.id, "REQUEST_STATUS", "CourseRequest", id, { status });
  revalidatePath("/trainings");
}
