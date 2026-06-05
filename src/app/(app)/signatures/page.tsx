import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card, Table, Th, Td, EmptyState } from "@/components/ui";
import { SIGNATURE_METHOD, SIGNATURE_STATUS } from "@/lib/labels";
import SignoutModal from "./SignoutModal";
import CompanySignModal from "./CompanySignModal";
import CheckinControls from "./CheckinControls";
import { ROLE_LABELS } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function SignaturesPage() {
  const user = await requireUser();
  const bId = user.battalionId!;
  const canSign = can(user.role, "signatures.manage");

  // היקף: קצין מחסן/נציג רואים את המחזיקים שלהם; מפמ/צופה רואים הכל
  const scopedToOwn =
    (user.role === "WAREHOUSE_MANAGER" || user.role === "COMPANY_REP" || user.role === "VIEWER") &&
    user.holderIds.length > 0;
  const holderFilter = scopedToOwn ? { currentHolderId: { in: user.holderIds } } : {};
  // חיילים: נציג פלוגה רואה את חיילי הפלוגה; אחרת כל חיילי הגדוד.
  // ⚠️ רק חיילים שאושרו ע"י השליש (enlisted=true) זכאים לחתום על ציוד.
  const isCompanyRep = user.role === "COMPANY_REP" && !!user.holderId;
  const soldierWhere = {
    battalionId: bId, active: true, enlisted: true,
    ...(isCompanyRep ? { companyId: user.holderId! } : {}),
  };
  // פלוגות לסינון בהחתמת חייל (לקצין מחסן — כדי לסנן ארוכה לפי פלוגה)
  const companiesForFilter = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "COMPANY", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const kits = user.holderId
    ? await prisma.signableKit.findMany({
        where: { holderId: user.holderId, active: true },
        include: { lines: { include: { itemType: true } } },
        orderBy: { name: "asc" },
      })
    : [];
  // פלוגות + אנשי הקשר שלהן (כל משתמש פלוגתי = נמען אפשרי)
  const companiesForSign = user.holderId
    ? await prisma.holder.findMany({
        where: { battalionId: bId, kind: "COMPANY", active: true },
        include: { users: { where: { active: true } } },
        orderBy: { name: "asc" },
      })
    : [];
  // מלאי כמותי וסריאלי במחסן של הקצין (להחתמת פלוגה)
  const warehouseBalances = user.holderId
    ? await prisma.stockBalance.findMany({
        where: { holderId: user.holderId, quantity: { gt: 0 } },
        include: { itemType: true, status: true },
      })
    : [];

  // רכבים שמשויכים לפלוגה/מחסן הנוכחיים (לבחירה כמיקום פיזי)
  const vehicles = user.holderId
    ? await prisma.serialUnit.findMany({
        where: {
          battalionId: bId,
          currentHolderId: user.holderId,
          itemType: { category: { warehouseType: "VEHICLES" } },
        },
        include: { itemType: true },
      })
    : [];

  const [pending, signedUnits, soldiers, availableUnits, statuses] = await Promise.all([
    prisma.signature.findMany({
      where: { battalionId: bId, status: "PENDING" },
      include: { soldier: true, signerUser: true, transfer: { include: { lines: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.serialUnit.findMany({
      where: { battalionId: bId, signedSoldierId: { not: null }, ...holderFilter },
      include: { itemType: true, status: true, signedSoldier: true, currentHolder: true },
      orderBy: { signedSoldier: { fullName: "asc" } },
    }),
    prisma.soldier.findMany({ where: soldierWhere, orderBy: { fullName: "asc" } }),
    prisma.serialUnit.findMany({
      where: { battalionId: bId, signedSoldierId: null, ...holderFilter },
      include: { itemType: true, status: true, currentHolder: true },
      orderBy: { itemType: { name: "asc" } },
    }),
    prisma.itemStatus.findMany({ where: { battalionId: bId, active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="חתימות חיילים"
        subtitle="החתמה דיגיטלית (QR/וואטסאפ/שרבוט) וזיכוי מהיר"
        action={
          canSign ? (
            <div className="flex gap-2">
              <CompanySignModal
                companies={companiesForSign.map((c) => ({
                  id: c.id, name: c.name,
                  members: c.users.map((u) => ({ id: u.id, name: u.fullName, role: ROLE_LABELS[u.role] })),
                }))}
                units={availableUnits.map((u) => ({ id: u.id, name: u.itemType.name, serial: u.serialNumber, status: u.status.name, statusId: u.statusId }))}
                balances={warehouseBalances.map((b) => ({
                  itemTypeId: b.itemTypeId, statusId: b.statusId,
                  name: b.itemType.name, unit: b.itemType.unit,
                  status: b.status.name, quantity: b.quantity,
                }))}
              />
              <SignoutModal
                companies={companiesForFilter}
                lockCompanyId={isCompanyRep ? user.holderId : null}
                soldiers={soldiers.map((s) => {
                  const c = companiesForFilter.find((x) => x.id === s.companyId);
                  return { id: s.id, name: s.fullName, pn: s.personalNumber, companyId: s.companyId, companyName: c?.name ?? null };
                })}
                units={availableUnits.map((u) => ({
                  id: u.id, name: u.itemType.name, serial: u.serialNumber,
                  holder: u.currentHolder?.name ?? "", status: u.status.name,
                }))}
                kits={kits.map((k) => ({ id: k.id, name: k.name, lines: k.lines.map((l) => ({ name: l.itemType.name, qty: l.quantity })) }))}
                vehicles={vehicles.map((v) => ({ id: v.id, name: v.itemType.name, plate: v.serialNumber }))}
              />
            </div>
          ) : undefined
        }
      />

      {/* ממתינים לחתימת החייל */}
      <h2 className="font-bold text-slate-700 mb-2">ממתינים לחתימה</h2>
      <Card className="mb-6">
        {pending.length === 0 ? (
          <EmptyState>אין החתמות ממתינות</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>חייל</Th><Th>פריטים</Th><Th>שיטה</Th><Th>סטטוס</Th><Th>נוצר</Th><Th></Th></tr>
            </thead>
            <tbody>
              {pending.map((s) => (
                <tr key={s.id}>
                  <Td className="font-medium">{s.soldier?.fullName ?? s.signerUser?.fullName ?? ""}</Td>
                  <Td className="text-center">{s.transfer?.lines.length ?? 0}</Td>
                  <Td><Badge>{SIGNATURE_METHOD[s.method]}</Badge></Td>
                  <Td><Badge className="bg-amber-100 text-amber-800">{SIGNATURE_STATUS[s.status]}</Badge></Td>
                  <Td className="text-xs text-slate-500">{s.createdAt.toLocaleDateString("he-IL")}</Td>
                  <Td>
                    <Link href={`/signatures/${s.token}`} className="text-xs text-blue-600 hover:underline">
                      קישור / QR
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* פריטים חתומים — זיכוי מהיר */}
      <h2 className="font-bold text-slate-700 mb-2">ציוד חתום על חיילים</h2>
      <Card>
        {signedUnits.length === 0 ? (
          <EmptyState>אין ציוד חתום</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>חייל</Th><Th>פריט</Th><Th>מס׳ סריאלי</Th><Th>מיקום פיזי</Th><Th>סטטוס</Th><Th>פעולות</Th>
              </tr>
            </thead>
            <tbody>
              {signedUnits.map((u) => (
                <tr key={u.id}>
                  <Td className="font-medium text-blue-700">{u.signedSoldier?.fullName}</Td>
                  <Td>{u.itemType.name}</Td>
                  <Td className="font-mono text-xs">{u.serialNumber}</Td>
                  <Td className="text-slate-500">{u.physicalLocation ?? "—"}</Td>
                  <Td><Badge>{u.status.name}</Badge></Td>
                  <Td>
                    {canSign && (
                      <CheckinControls
                        serialUnitId={u.id}
                        trackLocation={u.itemType.trackLocation}
                        currentLocation={u.physicalLocation ?? ""}
                        statuses={statuses.map((st) => ({ id: st.id, name: st.name }))}
                      />
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
