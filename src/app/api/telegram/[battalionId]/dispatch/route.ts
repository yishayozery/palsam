import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateTelegramInitData } from "@/lib/telegram-auth";
import { audit } from "@/lib/audit";
import { notifyMissionCreated } from "@/lib/dispatch-notify";

type Params = { params: Promise<{ battalionId: string }> };

async function authenticate(req: NextRequest, battalionId: string) {
  const initData = req.headers.get("x-telegram-init-data") || "";
  const battalion = await prisma.battalion.findUnique({
    where: { id: battalionId },
    select: { id: true, telegramBotToken: true },
  });
  if (!battalion?.telegramBotToken) return null;

  const tgUser = validateTelegramInitData(initData, battalion.telegramBotToken);
  if (!tgUser) return null;

  const soldier = await prisma.soldier.findFirst({
    where: { battalionId, telegramChatId: String(tgUser.id) },
    select: { id: true, fullName: true, battalionId: true },
  });

  return soldier ? { soldier, battalionId } : null;
}

/** GET — רשימת רכבים + חיילים לטופס שבצ"ק */
export async function GET(req: NextRequest, { params }: Params) {
  const { battalionId } = await params;
  const auth = await authenticate(req, battalionId);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [vehicles, soldiers, roles] = await Promise.all([
    prisma.serialUnit.findMany({
      where: {
        battalionId,
        signedSoldierId: null,
        itemType: { category: { warehouseType: "VEHICLES" } },
      },
      select: {
        id: true,
        serialNumber: true,
        itemType: { select: { name: true } },
      },
      orderBy: { itemType: { name: "asc" } },
    }),
    prisma.soldier.findMany({
      where: { battalionId, status: { notIn: ["DISCHARGED", "INACTIVE"] } },
      select: {
        id: true,
        fullName: true,
        personalNumber: true,
        company: { select: { name: true } },
      },
      orderBy: [{ company: { name: "asc" } }, { fullName: "asc" }],
    }),
    prisma.dispatchRole.findMany({
      where: { battalionId, active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, icon: true, isDriver: true },
    }),
  ]);

  return NextResponse.json({
    vehicles: vehicles.map((v) => ({
      id: v.id,
      label: `${v.itemType.name} — ${v.serialNumber}`,
    })),
    soldiers: soldiers.map((s) => ({
      id: s.id,
      name: s.fullName,
      pn: s.personalNumber,
      company: s.company?.name ?? null,
    })),
    roles: roles.map((r) => ({ id: r.id, name: r.name, icon: r.icon, isDriver: r.isDriver })),
  });
}

/** POST — שמירת שבצ"ק חדש */
export async function POST(req: NextRequest, { params }: Params) {
  const { battalionId } = await params;
  const auth = await authenticate(req, battalionId);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { vehicleSerialUnitId, missionDate, departureTime } = body as {
    vehicleSerialUnitId?: string;
    missionDate?: string;
    departureTime?: string;
  };
  // תמיכה בשני פורמטים: soldiers מובנה (עם נהג/תפקיד) או soldierIds ישן (הראשון = נהג)
  const soldiersInput: { soldierId: string; isDriver?: boolean; dispatchRoleId?: string | null }[] | null =
    Array.isArray(body.soldiers) ? body.soldiers : null;
  const soldierIds: string[] = soldiersInput ? soldiersInput.map((s) => s.soldierId) : (Array.isArray(body.soldierIds) ? body.soldierIds : []);

  if (!vehicleSerialUnitId) return NextResponse.json({ error: "בחר רכב" }, { status: 400 });
  if (!missionDate) return NextResponse.json({ error: "בחר תאריך" }, { status: 400 });
  if (!departureTime || !/^\d{2}:\d{2}$/.test(departureTime)) return NextResponse.json({ error: "שעת יציאה בפורמט HH:mm" }, { status: 400 });
  if (!soldierIds.length) return NextResponse.json({ error: "הוסף לפחות חייל אחד" }, { status: 400 });

  const vehicle = await prisma.serialUnit.findUnique({
    where: { id: vehicleSerialUnitId },
    select: { battalionId: true, itemType: { select: { category: { select: { warehouseType: true } } } } },
  });
  if (!vehicle || vehicle.battalionId !== battalionId) return NextResponse.json({ error: "רכב לא נמצא" }, { status: 400 });
  if (vehicle.itemType.category?.warehouseType !== "VEHICLES") return NextResponse.json({ error: "הפריט אינו רכב" }, { status: 400 });

  const validCount = await prisma.soldier.count({
    where: { id: { in: soldierIds }, battalionId, status: { notIn: ["DISCHARGED", "INACTIVE"] } },
  });
  if (validCount !== soldierIds.length) return NextResponse.json({ error: "חלק מהחיילים לא נמצאו" }, { status: 400 });

  const firstSoldier = await prisma.soldier.findFirst({
    where: { id: { in: soldierIds }, battalionId }, select: { companyId: true },
  });

  const missionDateObj = new Date(missionDate + "T00:00:00.000Z");
  if (isNaN(missionDateObj.getTime())) return NextResponse.json({ error: "תאריך שגוי" }, { status: 400 });

  // find or create a system user for bot-originated actions
  let createdById: string;
  const botUser = await prisma.appUser.findFirst({
    where: { battalionId, username: "telegram-bot" },
    select: { id: true },
  });
  if (botUser) {
    createdById = botUser.id;
  } else {
    // use the soldier's linked user if exists, otherwise use first admin
    const linkedUser = await prisma.appUser.findFirst({
      where: { battalionId, role: { not: "VIEWER" } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    createdById = linkedUser?.id ?? "";
    if (!createdById) return NextResponse.json({ error: "אין משתמש מערכת" }, { status: 500 });
  }

  // רשימת חיילים מובנית — נהג + תפקיד (ברירת מחדל: הראשון נהג)
  const crew = soldiersInput
    ? soldiersInput.map((s) => ({ soldierId: s.soldierId, isDriver: !!s.isDriver, dispatchRoleId: s.dispatchRoleId ?? null }))
    : soldierIds.map((sid, i) => ({ soldierId: sid, isDriver: i === 0, dispatchRoleId: null as string | null }));
  if (!crew.some((c) => c.isDriver)) crew[0].isDriver = true; // תמיד נהג אחד

  // יצירת Mission (המודל החדש) — כדי שהשבצ"ק יופיע במסך המשימות + התראות בוט לנהג
  const created = await prisma.$transaction(async (tx) => {
    const companyId = firstSoldier?.companyId ?? null;
    const m = await tx.mission.create({
      data: { battalionId, companyId, missionDate: missionDateObj, departureTime, createdById },
    });
    const a = await tx.vehicleAssignment.create({
      data: { battalionId, companyId, missionId: m.id, vehicleSerialUnitId, missionDate: missionDateObj, departureTime, createdById },
    });
    for (const s of crew) {
      await tx.vehicleAssignmentSoldier.create({ data: { assignmentId: a.id, soldierId: s.soldierId, isDriver: s.isDriver, dispatchRoleId: s.dispatchRoleId } });
    }
    return m;
  });

  await audit(createdById, "CREATE", "Mission", created.id, {
    vehicleSerialUnitId, soldierCount: crew.length, source: "telegram",
  });
  await notifyMissionCreated(created.id, battalionId);

  return NextResponse.json({ ok: true, id: created.id });
}
