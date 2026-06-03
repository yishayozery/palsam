import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card, Table, Th, Td, EmptyState } from "@/components/ui";
import { SIGNATURE_METHOD, SIGNATURE_STATUS } from "@/lib/labels";
import SignoutModal from "./SignoutModal";
import CheckinControls from "./CheckinControls";

export const dynamic = "force-dynamic";

export default async function SignaturesPage() {
  const user = await requireUser();
  const canSign =
    can(user.role, "company.manage") ||
    can(user.role, "armory.manage") ||
    can(user.role, "warehouse.manage");

  // היקף: רס"פ/ארמון רואים את תחומם; admin/קל"ג רואים הכל
  const scopeHolder = user.holderId || undefined;

  const [pending, signedUnits, soldiers, availableUnits, statuses] = await Promise.all([
    prisma.signature.findMany({
      where: { status: "PENDING" },
      include: { soldier: true, transfer: { include: { lines: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.serialUnit.findMany({
      where: {
        signedSoldierId: { not: null },
        ...(scopeHolder ? { currentHolderId: scopeHolder } : {}),
      },
      include: { itemType: true, status: true, signedSoldier: true, currentHolder: true },
      orderBy: { signedSoldier: { fullName: "asc" } },
    }),
    prisma.soldier.findMany({
      where: { active: true, ...(scopeHolder ? { companyId: scopeHolder } : {}) },
      orderBy: { fullName: "asc" },
    }),
    prisma.serialUnit.findMany({
      where: {
        signedSoldierId: null,
        currentHolderId: scopeHolder ? scopeHolder : { not: null },
      },
      include: { itemType: true, status: true, currentHolder: true },
      orderBy: { itemType: { name: "asc" } },
    }),
    prisma.itemStatus.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="חתימות חיילים"
        subtitle="החתמה דיגיטלית (QR/וואטסאפ/שרבוט) וזיכוי מהיר"
        action={
          canSign ? (
            <SignoutModal
              soldiers={soldiers.map((s) => ({ id: s.id, name: s.fullName, pn: s.personalNumber }))}
              units={availableUnits.map((u) => ({
                id: u.id, name: u.itemType.name, serial: u.serialNumber,
                holder: u.currentHolder?.name ?? "", status: u.status.name,
              }))}
            />
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
                  <Td className="font-medium">{s.soldier.fullName}</Td>
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
