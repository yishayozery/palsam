import { Fragment } from "react";
import { requireSuperAdmin } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card, Table, Th, Td, EmptyState } from "@/components/ui";
import InviteLink from "@/components/InviteLink";
import BattalionForm from "./BattalionForm";
import { toggleBattalion, resetUserPassword, setBattalionSupportWhatsapp, seedBattalionEssentialsAction, createDemoCompanyAction, deleteDemoCompanyAction, setUnitLevel, setUnitParent } from "./actions";
import { getSetupChecklist } from "@/lib/battalionSetup";

export const dynamic = "force-dynamic";

export default async function BattalionsPage() {
  await requireSuperAdmin();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  const battalions = await prisma.battalion.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { users: true, soldiers: true, itemTypes: true, holders: true } },
      users: { where: { role: "BATTALION_ADMIN" }, select: { id: true, username: true, fullName: true, phone: true, passwordSet: true, inviteToken: true } },
    },
  });
  // צ'ק-ליסט הקמה פר-גדוד
  const checklists = new Map(
    await Promise.all(battalions.map(async (b) => [b.id, await getSetupChecklist(b.id)] as const)),
  );
  // חטיבות (לשיוך גדודים) + מיפוי שם חטיבת-אב
  const brigades = battalions.filter((b) => b.level === "BRIGADE");
  const nameById = new Map(battalions.map((b) => [b.id, b.name]));

  return (
    <div>
      <PageHeader
        title="ניהול גדודים"
        subtitle="אדמין-על — הקמת גדודים ומנהלי מערכת"
        action={<BattalionForm />}
      />
      <Card>
        {battalions.length === 0 ? (
          <EmptyState>אין גדודים. הקם גדוד ראשון.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>גדוד</Th><Th>קוד</Th><Th>מנהלי מערכת</Th><Th>ווטסאפ תמיכה</Th><Th>משתמשים</Th><Th>חיילים</Th><Th>מק״טים</Th><Th>סטטוס</Th><Th></Th></tr>
            </thead>
            <tbody>
              {battalions.map((b) => (
                <Fragment key={b.id}>
                <tr>
                  <Td className="font-medium">{b.name}</Td>
                  <Td className="font-mono text-xs">{b.code}</Td>
                  <Td className="text-xs">
                    {b.users.map((u) => (
                      <div key={u.username} className="flex items-center gap-2 flex-wrap">
                        <span>{u.fullName} (@{u.username})</span>
                        {!u.passwordSet && u.inviteToken ? (
                          <InviteLink token={u.inviteToken} phone={u.phone} baseUrl={baseUrl} role="admin" />
                        ) : (
                          <form action={resetUserPassword}>
                            <input type="hidden" name="id" value={u.id} />
                            <button className="text-[11px] bg-amber-50 border border-amber-300 text-amber-800 rounded px-2 py-0.5 hover:bg-amber-100">🔑 איפוס סיסמה</button>
                          </form>
                        )}
                      </div>
                    ))}
                    {b.users.length === 0 && "—"}
                    <div className="text-[10px] text-slate-400 mt-1">מנהלים נוספים — בניהול משתמשים בתוך הגדוד</div>
                  </Td>
                  <Td className="text-xs">
                    <form action={setBattalionSupportWhatsapp} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={b.id} />
                      <input name="supportWhatsapp" defaultValue={b.supportWhatsapp ?? ""} placeholder="972501234567"
                        className="w-28 rounded border border-slate-300 px-2 py-0.5 text-xs font-mono" />
                      <button className="text-[11px] text-blue-600 hover:underline">שמור</button>
                    </form>
                  </Td>
                  <Td className="text-center">{b._count.users}</Td>
                  <Td className="text-center">{b._count.soldiers}</Td>
                  <Td className="text-center">{b._count.itemTypes}</Td>
                  <Td>{b.active ? <Badge className="bg-emerald-100 text-emerald-700">פעיל</Badge> : <Badge className="bg-rose-100 text-rose-700">מושבת</Badge>}</Td>
                  <Td>
                    <form action={toggleBattalion}>
                      <input type="hidden" name="id" value={b.id} />
                      <button className="text-xs text-slate-500 hover:text-slate-800">{b.active ? "השבתה" : "הפעלה"}</button>
                    </form>
                  </Td>
                </tr>
                <tr className="bg-slate-50/60">
                  <td colSpan={9} className="px-4 py-2">
                    {(() => {
                      const c = checklists.get(b.id);
                      if (!c) return null;
                      const chip = (ok: boolean, label: string) => (
                        <span className={`text-[11px] rounded-full px-2 py-0.5 border ${ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                          {ok ? "✅" : "◻️"} {label}
                        </span>
                      );
                      const ready = c.hasPresetRoles;
                      return (
                        <div className="flex flex-wrap items-center gap-2">
                          {/* 🏛️ רמת יחידה + שיוך לחטיבה */}
                          <form action={setUnitLevel} className="flex items-center gap-1">
                            <input type="hidden" name="id" value={b.id} />
                            <select name="level" defaultValue={b.level} className="text-[11px] rounded border border-slate-300 px-1 py-0.5">
                              <option value="BATTALION">גדוד</option>
                              <option value="BRIGADE">חטיבה</option>
                            </select>
                            <button className="text-[11px] text-blue-600 hover:underline">שמור רמה</button>
                          </form>
                          {b.level === "BATTALION" && (
                            <form action={setUnitParent} className="flex items-center gap-1">
                              <input type="hidden" name="id" value={b.id} />
                              <select name="parentId" defaultValue={b.parentId ?? ""} className="text-[11px] rounded border border-slate-300 px-1 py-0.5">
                                <option value="">— ללא חטיבה —</option>
                                {brigades.map((br) => <option key={br.id} value={br.id}>{br.name}</option>)}
                              </select>
                              <button className="text-[11px] text-blue-600 hover:underline">שייך</button>
                            </form>
                          )}
                          {b.level === "BRIGADE" && <span className="text-[11px] rounded-full px-2 py-0.5 bg-indigo-100 text-indigo-700">🏛️ חטיבה</span>}
                          {b.level === "BATTALION" && b.parentId && <span className="text-[11px] text-slate-500">▲ {nameById.get(b.parentId) ?? ""}</span>}
                          <span className="w-px h-4 bg-slate-200" />
                          <span className="text-[11px] font-semibold text-slate-500">צ׳ק-ליסט הקמה:</span>
                          {chip(true, `${b._count.holders} מחסנים`)}
                          {chip(c.hasPresetRoles, `תפקידים (${c.roles})`)}
                          {chip(c.botRules > 0, "חוקי בוט")}
                          {chip(c.hasProcedures, "נהלים")}
                          {chip(c.hasDemo, "פלוגת דמו")}
                          <div className="grow" />
                          {!ready && (
                            <form action={seedBattalionEssentialsAction}>
                              <input type="hidden" name="id" value={b.id} />
                              <button className="text-[11px] bg-blue-600 text-white rounded px-2 py-1 hover:bg-blue-700">⚙️ זרע בסיס (תפקידים+נהלים+בוט)</button>
                            </form>
                          )}
                          {ready && (
                            <form action={seedBattalionEssentialsAction}>
                              <input type="hidden" name="id" value={b.id} />
                              <button className="text-[11px] text-slate-500 hover:underline">↻ רענן בסיס</button>
                            </form>
                          )}
                          {!c.hasDemo ? (
                            <form action={createDemoCompanyAction}>
                              <input type="hidden" name="id" value={b.id} />
                              <button className="text-[11px] bg-violet-600 text-white rounded px-2 py-1 hover:bg-violet-700">🎭 צור פלוגת דמו</button>
                            </form>
                          ) : (
                            <form action={deleteDemoCompanyAction}>
                              <input type="hidden" name="id" value={b.id} />
                              <button className="text-[11px] bg-rose-50 border border-rose-200 text-rose-700 rounded px-2 py-1 hover:bg-rose-100">🗑️ מחק דמו</button>
                            </form>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                </tr>
                </Fragment>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
