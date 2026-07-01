import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

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

/** GET — vehicles + soldiers for the form */
export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const dt = await validateToken(token);
  if (!dt) return NextResponse.json({ error: "קישור לא תקף או שפג תוקפו" }, { status: 403 });

  const battalionId = dt.battalionId;

  const [vehicles, soldiers] = await Promise.all([
    prisma.serialUnit.findMany({
      where: {
        battalionId,
        dischargedAt: null,
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
  ]);

  return NextResponse.json({
    battalionName: dt.battalion.name,
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
  });
}

/** POST — create dispatch */
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const dt = await validateToken(token);
  if (!dt) return NextResponse.json({ error: "קישור לא תקף או שפג תוקפו" }, { status: 403 });

  const battalionId = dt.battalionId;
  const body = await req.json();
  const { vehicleSerialUnitId, missionDate, departureTime, soldierIds, missionType } = body as {
    vehicleSerialUnitId?: string;
    missionDate?: string;
    departureTime?: string;
    soldierIds?: string[];
    missionType?: string;
  };

  if (!vehicleSerialUnitId) return NextResponse.json({ error: "בחר רכב" }, { status: 400 });
  if (!missionDate) return NextResponse.json({ error: "בחר תאריך" }, { status: 400 });
  if (!departureTime || !/^\d{2}:\d{2}$/.test(departureTime)) return NextResponse.json({ error: "שעת יציאה בפורמט HH:mm" }, { status: 400 });
  if (!soldierIds?.length) return NextResponse.json({ error: "הוסף לפחות חייל אחד" }, { status: 400 });

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

  let createdById: string;
  const botUser = await prisma.appUser.findFirst({
    where: { battalionId, username: "telegram-bot" },
    select: { id: true },
  });
  if (botUser) {
    createdById = botUser.id;
  } else {
    const fallbackUser = await prisma.appUser.findFirst({
      where: { battalionId, role: { not: "VIEWER" } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    createdById = fallbackUser?.id ?? "";
    if (!createdById) return NextResponse.json({ error: "אין משתמש מערכת" }, { status: 500 });
  }

  const created = await prisma.$transaction(async (tx) => {
    await tx.dispatchToken.update({
      where: { id: dt.id },
      data: { useCount: { increment: 1 } },
    });

    const a = await tx.vehicleAssignment.create({
      data: {
        battalionId,
        companyId: firstSoldier?.companyId ?? null,
        vehicleSerialUnitId,
        missionDate: missionDateObj,
        departureTime,
        createdById,
      },
    });
    for (const sid of soldierIds) {
      await tx.vehicleAssignmentSoldier.create({ data: { assignmentId: a.id, soldierId: sid } });
    }
    return a;
  });

  await audit(createdById, "CREATE", "VehicleAssignment", created.id, {
    vehicleSerialUnitId, soldierCount: soldierIds.length, source: "dispatch-link",
  });

  return NextResponse.json({ ok: true, id: created.id });
}
