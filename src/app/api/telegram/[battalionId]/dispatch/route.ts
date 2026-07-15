import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateTelegramInitData } from "@/lib/telegram-auth";
import { decryptSecret } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { notifyMissionCreated } from "@/lib/dispatch-notify";
import { createOrUpdateMission, type MissionInput } from "@/lib/mission-core";

type Params = { params: Promise<{ battalionId: string }> };

async function authenticate(req: NextRequest, battalionId: string) {
  const initData = req.headers.get("x-telegram-init-data") || "";
  const battalion = await prisma.battalion.findUnique({
    where: { id: battalionId },
    select: { id: true, telegramBotToken: true },
  });
  if (!battalion?.telegramBotToken) return null;

  const tgUser = validateTelegramInitData(initData, decryptSecret(battalion.telegramBotToken)); // 🔐 טוקן מוצפן ב-rest
  if (!tgUser) return null;

  const soldier = await prisma.soldier.findFirst({
    where: { battalionId, telegramChatId: String(tgUser.id) },
    select: { id: true, fullName: true, battalionId: true },
  });

  return soldier ? { soldier, battalionId } : null;
}

/** GET — כל הנתונים לפתיחת משימה (זהה למסך המערכת): רכבים, חיילים+כשירות, תפקידים, שבצ"ק קבוע, פלוגות, נוכחות. */
export async function GET(req: NextRequest, { params }: Params) {
  const { battalionId } = await params;
  const auth = await authenticate(req, battalionId);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const bId = battalionId;

  const [vehicles, soldiers, roles, templates, vehicleTypeLicenses, companies, battDriving] = await Promise.all([
    prisma.serialUnit.findMany({
      where: { battalionId: bId, dischargedAt: null, itemType: { category: { warehouseType: "VEHICLES" } } },
      select: { id: true, serialNumber: true, itemTypeId: true, itemType: { select: { name: true } } },
      orderBy: [{ itemType: { name: "asc" } }, { serialNumber: "asc" }],
    }),
    prisma.soldier.findMany({
      where: { battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] } },
      select: {
        id: true, fullName: true, personalNumber: true,
        drivingProcedureSignedAt: true, drivingRefresherDate: true,
        company: { select: { name: true } },
        drivingLicenses: { select: { licenseTypeId: true } },
      },
      orderBy: [{ company: { name: "asc" } }, { fullName: "asc" }],
    }),
    prisma.dispatchRole.findMany({
      where: { battalionId: bId, active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, icon: true, isDriver: true },
    }),
    prisma.dispatchTemplate.findMany({
      where: { battalionId: bId, active: true },
      include: {
        vehicleSerialUnit: { include: { itemType: { select: { name: true } } } },
        vehicleItemType: { select: { name: true } },
        slots: { include: { soldier: { select: { id: true } }, dispatchRole: { select: { id: true, isDriver: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.vehicleTypeLicense.findMany({
      where: { itemType: { battalionId: bId } },
      select: { itemTypeId: true, licenseTypeId: true },
    }),
    prisma.holder.findMany({ where: { battalionId: bId, kind: "COMPANY", active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.battalion.findUnique({ where: { id: bId }, select: { drivingRefreshDays: true, drivingProcedureUpdatedAt: true } }),
  ]);

  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const presentRecords = await prisma.attendanceRecord.findMany({
    where: { date: new Date(todayStr + "T00:00:00Z"), soldier: { battalionId: bId }, status: { isPresent: true } },
    select: { soldierId: true },
  });
  const presentSoldierIds = presentRecords.map((r) => r.soldierId);

  const vtlMap: Record<string, string[]> = {};
  for (const vl of vehicleTypeLicenses) (vtlMap[vl.itemTypeId] ??= []).push(vl.licenseTypeId);

  const refreshDays = battDriving?.drivingRefreshDays ?? 180;
  const procUpdated = battDriving?.drivingProcedureUpdatedAt ?? null;

  // מיפוי חייל → תפקידי שבצ"ק שהוא מוגדר בהם (מהשבצ"ק הקבוע)
  const soldierRoleMap: Record<string, string[]> = {};
  for (const t of templates) for (const slot of t.slots) {
    if (slot.soldier && slot.dispatchRole?.id) (soldierRoleMap[slot.soldier.id] ??= []).push(slot.dispatchRole.id);
  }

  return NextResponse.json({
    vehicles: vehicles.map((v) => ({
      id: v.id, name: v.itemType.name, serial: v.serialNumber, typeName: v.itemType.name,
      label: `${v.itemType.name} — ${v.serialNumber}`, requiredLicenseIds: vtlMap[v.itemTypeId] ?? [],
    })),
    soldiers: soldiers.map((s) => {
      const procValid = !!s.drivingProcedureSignedAt && (!procUpdated || s.drivingProcedureSignedAt >= procUpdated);
      let refreshValid = false;
      if (s.drivingRefresherDate) { const exp = new Date(s.drivingRefresherDate); exp.setDate(exp.getDate() + refreshDays); refreshValid = exp.getTime() >= Date.now(); }
      return { id: s.id, name: s.fullName, pn: s.personalNumber, company: s.company?.name ?? null, licenseIds: s.drivingLicenses.map((l) => l.licenseTypeId), procValid, refreshValid };
    }),
    roles: roles.map((r) => ({ id: r.id, name: r.name, icon: r.icon, isDriver: r.isDriver })),
    templates: templates.map((t) => ({
      id: t.id, name: t.name,
      vehicleSerialUnitId: t.vehicleSerialUnitId ?? "",
      vehicleTypeName: t.vehicleSerialUnit?.itemType.name ?? t.vehicleItemType?.name ?? "רכב",
      soldiers: t.slots.filter((s) => s.soldier).map((s) => ({ soldierId: s.soldier!.id, dispatchRoleId: s.dispatchRoleId, isDriver: s.dispatchRole?.isDriver ?? false })),
    })),
    companies: companies.map((c) => ({ id: c.id, name: c.name })),
    presentSoldierIds,
    soldierRoleMap,
  });
}

/** POST — פתיחת משימה חדשה (זהה למסך): רב-רכבי, שבצ"ק קבוע, רכבי/חיילי חוץ. */
export async function POST(req: NextRequest, { params }: Params) {
  const { battalionId } = await params;
  const auth = await authenticate(req, battalionId);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();

  // תאימות לאחור: הפורמט הישן (רכב יחיד + soldiers/soldierIds) → נמיר למבנה משימה
  let input: MissionInput;
  if (Array.isArray(body.vehicles)) {
    input = body as MissionInput;
  } else if (body.vehicleSerialUnitId) {
    const soldiersInput: { soldierId: string; isDriver?: boolean; dispatchRoleId?: string | null }[] | null =
      Array.isArray(body.soldiers) ? body.soldiers : null;
    const soldierIds: string[] = soldiersInput ? soldiersInput.map((s) => s.soldierId) : (Array.isArray(body.soldierIds) ? body.soldierIds : []);
    const crew = soldiersInput
      ? soldiersInput.map((s) => ({ soldierId: s.soldierId, isDriver: !!s.isDriver, dispatchRoleId: s.dispatchRoleId ?? null }))
      : soldierIds.map((sid, i) => ({ soldierId: sid, isDriver: i === 0, dispatchRoleId: null as string | null }));
    if (crew.length && !crew.some((c) => c.isDriver)) crew[0].isDriver = true;
    input = {
      missionDate: body.missionDate, departureTime: body.departureTime,
      vehicles: [{ vehicleSerialUnitId: body.vehicleSerialUnitId, soldiers: crew }],
    };
  } else {
    return NextResponse.json({ error: "הוסף לפחות רכב אחד" }, { status: 400 });
  }

  // משתמש מערכת לפעולות מהבוט
  let createdById: string;
  const botUser = await prisma.appUser.findFirst({ where: { battalionId, username: "telegram-bot" }, select: { id: true } });
  if (botUser) {
    createdById = botUser.id;
  } else {
    const linkedUser = await prisma.appUser.findFirst({ where: { battalionId, role: { not: "VIEWER" } }, select: { id: true }, orderBy: { createdAt: "asc" } });
    createdById = linkedUser?.id ?? "";
    if (!createdById) return NextResponse.json({ error: "אין משתמש מערכת" }, { status: 500 });
  }

  const res = await createOrUpdateMission(battalionId, createdById, input);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });

  await audit(createdById, res.isNew ? "CREATE" : "UPDATE", "Mission", res.id, { vehicles: input.vehicles.length, source: "telegram" });
  if (res.isNew) await notifyMissionCreated(res.id, battalionId);

  return NextResponse.json({ ok: true, id: res.id });
}
