import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { notifyMissionCreated } from "@/lib/dispatch-notify";
import { createOrUpdateMission, type MissionInput } from "@/lib/mission-core";

type Params = { params: Promise<{ token: string }> };

async function validateToken(token: string) {
  const dt = await prisma.dispatchToken.findUnique({
    where: { token },
    include: { battalion: { select: { id: true, name: true } } },
  });
  if (!dt) return null;
  if (dt.expiresAt < new Date()) return null;
  if (dt.useCount >= dt.maxUses) return null;
  return dt;
}

/** GET — כל הנתונים לפתיחת משימה (זהה למסך): רכבים+כשירות, חיילים, תפקידים, שבצ"ק קבוע, נוכחות. */
export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const dt = await validateToken(token);
  if (!dt) return NextResponse.json({ error: "קישור לא תקף או שפג תוקפו" }, { status: 403 });
  const bId = dt.battalionId;

  const [vehicles, soldiers, roles, templates, vehicleTypeLicenses, battDriving] = await Promise.all([
    prisma.serialUnit.findMany({
      where: { battalionId: bId, dischargedAt: null, itemType: { category: { warehouseType: "VEHICLES" } } },
      select: { id: true, serialNumber: true, itemTypeId: true, itemType: { select: { name: true } } },
      orderBy: [{ itemType: { name: "asc" } }, { serialNumber: "asc" }],
    }),
    prisma.soldier.findMany({
      where: { battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] } },
      select: { id: true, fullName: true, personalNumber: true, drivingProcedureSignedAt: true, drivingRefresherDate: true, company: { select: { name: true } }, drivingLicenses: { select: { licenseTypeId: true } } },
      orderBy: [{ company: { name: "asc" } }, { fullName: "asc" }],
    }),
    prisma.dispatchRole.findMany({ where: { battalionId: bId, active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, icon: true, isDriver: true } }),
    prisma.dispatchTemplate.findMany({
      where: { battalionId: bId, active: true },
      include: { vehicleSerialUnit: { include: { itemType: { select: { name: true } } } }, vehicleItemType: { select: { name: true } }, slots: { include: { soldier: { select: { id: true } }, dispatchRole: { select: { id: true, isDriver: true } } } } },
      orderBy: { name: "asc" },
    }),
    prisma.vehicleTypeLicense.findMany({ where: { itemType: { battalionId: bId } }, select: { itemTypeId: true, licenseTypeId: true } }),
    prisma.battalion.findUnique({ where: { id: bId }, select: { drivingRefreshDays: true, drivingProcedureUpdatedAt: true } }),
  ]);

  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const presentRecords = await prisma.attendanceRecord.findMany({ where: { date: new Date(todayStr + "T00:00:00Z"), soldier: { battalionId: bId }, status: { isPresent: true } }, select: { soldierId: true } });
  const presentSoldierIds = presentRecords.map((r) => r.soldierId);

  const vtlMap: Record<string, string[]> = {};
  for (const vl of vehicleTypeLicenses) (vtlMap[vl.itemTypeId] ??= []).push(vl.licenseTypeId);
  const refreshDays = battDriving?.drivingRefreshDays ?? 180;
  const procUpdated = battDriving?.drivingProcedureUpdatedAt ?? null;

  return NextResponse.json({
    battalionName: dt.battalion.name,
    vehicles: vehicles.map((v) => ({ id: v.id, name: v.itemType.name, serial: v.serialNumber, typeName: v.itemType.name, label: `${v.itemType.name} — ${v.serialNumber}`, requiredLicenseIds: vtlMap[v.itemTypeId] ?? [] })),
    soldiers: soldiers.map((s) => {
      const procValid = !!s.drivingProcedureSignedAt && (!procUpdated || s.drivingProcedureSignedAt >= procUpdated);
      let refreshValid = false;
      if (s.drivingRefresherDate) { const exp = new Date(s.drivingRefresherDate); exp.setDate(exp.getDate() + refreshDays); refreshValid = exp.getTime() >= Date.now(); }
      return { id: s.id, name: s.fullName, pn: s.personalNumber, company: s.company?.name ?? null, licenseIds: s.drivingLicenses.map((l) => l.licenseTypeId), procValid, refreshValid };
    }),
    roles: roles.map((r) => ({ id: r.id, name: r.name, icon: r.icon, isDriver: r.isDriver })),
    templates: templates.map((t) => ({ id: t.id, name: t.name, vehicleSerialUnitId: t.vehicleSerialUnitId ?? "", vehicleTypeName: t.vehicleSerialUnit?.itemType.name ?? t.vehicleItemType?.name ?? "רכב", soldiers: t.slots.filter((s) => s.soldier).map((s) => ({ soldierId: s.soldier!.id, dispatchRoleId: s.dispatchRoleId, isDriver: s.dispatchRole?.isDriver ?? false })) })),
    presentSoldierIds,
  });
}

/** POST — פתיחת משימה מלאה (רב-רכבי) דרך לינק ציבורי מאובטח בטוקן. */
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const dt = await validateToken(token);
  if (!dt) return NextResponse.json({ error: "קישור לא תקף או שפג תוקפו" }, { status: 403 });
  const battalionId = dt.battalionId;

  const body = await req.json();
  if (!Array.isArray(body.vehicles)) return NextResponse.json({ error: "הוסף לפחות רכב אחד" }, { status: 400 });
  const input = body as MissionInput;

  let createdById: string;
  const botUser = await prisma.appUser.findFirst({ where: { battalionId, username: "telegram-bot" }, select: { id: true } });
  if (botUser) createdById = botUser.id;
  else {
    const fb = await prisma.appUser.findFirst({ where: { battalionId, role: { not: "VIEWER" } }, select: { id: true }, orderBy: { createdAt: "asc" } });
    createdById = fb?.id ?? "";
    if (!createdById) return NextResponse.json({ error: "אין משתמש מערכת" }, { status: 500 });
  }

  const res = await createOrUpdateMission(battalionId, createdById, input);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });

  await prisma.dispatchToken.update({ where: { id: dt.id }, data: { useCount: { increment: 1 } } });
  await audit(createdById, res.isNew ? "CREATE" : "UPDATE", "Mission", res.id, { vehicles: input.vehicles.length, source: "dispatch-link" });
  if (res.isNew) await notifyMissionCreated(res.id, battalionId);

  return NextResponse.json({ ok: true, id: res.id });
}
