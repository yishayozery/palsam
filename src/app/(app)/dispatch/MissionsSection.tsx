"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import ConvoyView, { vehicleIcon } from "./ConvoyView";
import MissionModal, { type MVehicle, type MSoldier, type MTemplate, type MRole, type EditMission } from "./MissionModal";
import { toggleMissionComplete, deleteMission, startMission, toggleTripConfirmed } from "./actions";

type MSoldierFull = { vasId: string; soldierId: string | null; externalName: string | null; externalPersonalNumber: string | null; isDriver: boolean; name: string; pn: string | null; tripConfirmedAt: string | null; dispatchRoleId?: string | null };
type MVehicleFull = {
  isExternal: boolean; vehicleSerialUnitId: string | null; externalVehicleNumber: string | null; externalVehicleTypeName: string | null;
  label: string; typeName: string; soldiers: MSoldierFull[];
};
export type MissionFull = {
  id: string; title: string | null; companyId: string | null; companyName: string | null;
  commanderName: string | null; commanderSoldierId?: string | null; commanderNameRaw?: string | null;
  hasExternal: boolean; hasUnqualifiedDriver: boolean;
  missionDate: string; departureTime: string; notes: string | null; completedAt: string | null; startedAt: string | null; createdByName: string;
  vehicles: MVehicleFull[];
};

export default function MissionsSection({
  missions, companies, vehicles, soldiers, templates, dispatchRoles = [], soldierRoleMap = {}, presentSoldierIds = [], myCompanyId,
}: {
  missions: MissionFull[];
  companies: { id: string; name: string }[];
  vehicles: MVehicle[];
  soldiers: MSoldier[];
  templates: MTemplate[];
  dispatchRoles?: MRole[];
  soldierRoleMap?: Record<string, string[]>;
  presentSoldierIds?: string[];
  myCompanyId: string | null;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [modal, setModal] = useState<{ open: boolean; edit: EditMission | null; reuse?: boolean }>({ open: false, edit: null });
  const roleIcon = (id: string | null | undefined) => (id ? dispatchRoles.find((r) => r.id === id)?.icon ?? "" : "");
  const [tab, setTab] = useState<"active" | "done">("active");
  const shown = missions.filter((m) => (tab === "active" ? !m.completedAt : !!m.completedAt));

  function missionText(m: MissionFull): string {
    const lines = [`🚚 ${m.title || "משימה"} — ${new Date(m.missionDate).toLocaleDateString("he-IL")} · ${m.departureTime}`];
    if (m.commanderName) lines.push(`מפקד משימה: ${m.commanderName}`);
    for (const v of m.vehicles) {
      lines.push(`\n${v.isExternal ? "🔶" : "🚗"} ${v.label}`);
      for (const s of v.soldiers) lines.push(`  ${s.isDriver ? "🚗 נהג: " : "• "}${s.name}${s.pn ? ` (${s.pn})` : ""}`);
    }
    return lines.join("\n");
  }

  function openNew() { setModal({ open: true, edit: null }); }
  function toEditMission(m: MissionFull): EditMission {
    return {
      id: m.id, title: m.title, companyId: m.companyId, missionDate: m.missionDate, departureTime: m.departureTime, notes: m.notes,
      commanderSoldierId: m.commanderSoldierId ?? null, commanderName: m.commanderNameRaw ?? null,
      vehicles: m.vehicles.map((v) => ({
        isExternal: v.isExternal, vehicleSerialUnitId: v.vehicleSerialUnitId,
        externalVehicleNumber: v.externalVehicleNumber, externalVehicleTypeName: v.externalVehicleTypeName,
        soldiers: v.soldiers.map((s) => ({ soldierId: s.soldierId, externalName: s.externalName, externalPersonalNumber: s.externalPersonalNumber, isDriver: s.isDriver, dispatchRoleId: s.dispatchRoleId ?? null })),
      })),
    };
  }
  function openEdit(m: MissionFull) { setModal({ open: true, edit: toEditMission(m) }); }
  // שבץ מחדש — פותח משימה חדשה עם כל הרכבים/החיילים המשובצים (שכפול משימה שהסתיימה)
  function openReuse(m: MissionFull) { setModal({ open: true, edit: toEditMission(m), reuse: true }); }
  function act(fn: (fd: FormData) => Promise<{ ok?: boolean; error?: string }>, id: string, extra?: Record<string, string>) {
    const fd = new FormData(); fd.set("id", id);
    if (extra) for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    start(async () => { await fn(fd); router.refresh(); });
  }
  function startMissionAct(id: string) {
    const fd = new FormData(); fd.set("id", id);
    start(async () => {
      const r = await startMission(fd);
      if (r.error && r.missing && r.missing.length) {
        if (confirm(`${r.error}\n\nלהתחיל את המשימה בכל זאת?`)) {
          const fd2 = new FormData(); fd2.set("id", id); fd2.set("force", "true");
          await startMission(fd2);
        }
      }
      router.refresh();
    });
  }
  function confirmTrip(vasId: string, confirmed: boolean) {
    const fd = new FormData(); fd.set("vasId", vasId); fd.set("confirmed", String(confirmed));
    start(async () => { await toggleTripConfirmed(fd); router.refresh(); });
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <h2 className="font-bold text-slate-700">🚚 משימות (שיירות)</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={openNew} className="text-sm bg-blue-700 hover:bg-blue-800 text-white rounded-lg px-4 py-2 font-medium">+ משימה חדשה</button>
          <a href="/dispatch/templates" className="text-sm bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-lg px-4 py-2 font-medium">📋 שבצ&quot;ק קבוע</a>
        </div>
      </div>

      {/* טאבים: בפעילות / הסתיימו */}
      <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-sm mb-3">
        <button onClick={() => setTab("active")} className={`px-4 py-1.5 font-medium ${tab === "active" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>בפעילות ({missions.filter((m) => !m.completedAt).length})</button>
        <button onClick={() => setTab("done")} className={`px-4 py-1.5 font-medium ${tab === "done" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>הסתיימו ({missions.filter((m) => !!m.completedAt).length})</button>
      </div>

      {shown.length === 0 ? (
        <Card className="p-5 text-center text-slate-400 text-sm">{tab === "active" ? "אין משימות פעילות. לחץ \"+ משימה חדשה\"." : "אין משימות שהסתיימו."}</Card>
      ) : (
        <div className="space-y-3">
          {shown.map((m) => {
            const totalSoldiers = m.vehicles.reduce((n, v) => n + v.soldiers.length, 0);
            return (
              <Card key={m.id} className={`overflow-hidden ${m.completedAt ? "opacity-60" : ""}`}>
                <div className="bg-slate-100 px-4 py-2 flex items-center justify-between gap-2 flex-wrap border-b border-slate-200">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800">{m.title || "משימה"}</span>
                    <span className="text-xs text-slate-500">{new Date(m.missionDate).toLocaleDateString("he-IL")} · {m.departureTime}</span>
                    {m.commanderName && <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-2 py-0.5">👤 {m.commanderName}</span>}
                    {m.hasExternal && <span title="כולל רכב חוץ" className="text-sm">🔶</span>}
                    {m.hasUnqualifiedDriver && <span title="נהג לא מוסמך במשימה!" className="text-xs bg-rose-600 text-white font-bold rounded px-2 py-0.5">🔴 נהג לא מוסמך</span>}
                    {m.startedAt && !m.completedAt && <span title="המשימה יצאה לדרך" className="text-[11px] text-blue-700 bg-blue-50 rounded px-2 py-0.5">▶️ יצאה</span>}
                    {m.completedAt && <span className="text-[11px] text-emerald-700 bg-emerald-50 rounded px-2 py-0.5">✓ הסתיימה</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={`https://wa.me/?text=${encodeURIComponent(missionText(m))}`} target="_blank" rel="noreferrer" title="שלח בוואטסאפ" className="text-xs text-emerald-600 hover:underline">💬</a>
                    <a href={`https://t.me/share/url?url=${encodeURIComponent("https://www.palmy.co.il")}&text=${encodeURIComponent(missionText(m))}`} target="_blank" rel="noreferrer" title="שלח בטלגרם" className="text-xs text-sky-600 hover:underline">📲</a>
                    <button onClick={() => openEdit(m)} className="text-xs text-slate-600 hover:underline">✏️ עריכה</button>
                    {!m.completedAt && !m.startedAt && (
                      <button onClick={() => startMissionAct(m.id)} className="text-xs text-blue-700 hover:underline font-medium">▶️ התחל משימה</button>
                    )}
                    {m.completedAt && (
                      <button onClick={() => openReuse(m)} title="פתח משימה חדשה עם אותם רכבים וחיילים"
                        className="text-xs text-blue-700 hover:underline font-medium">🔁 שבץ מחדש</button>
                    )}
                    <button onClick={() => act(toggleMissionComplete, m.id, { completed: m.completedAt ? "false" : "true" })}
                      className="text-xs text-emerald-700 hover:underline">{m.completedAt ? "↩︎ פתח מחדש" : "✓ סיים משימה"}</button>
                    <button onClick={() => { if (confirm("למחוק את המשימה?")) act(deleteMission, m.id); }}
                      className="text-xs text-rose-500 hover:underline">🗑️ מחק</button>
                  </div>
                </div>
                <div className="p-3 space-y-3">
                  <ConvoyView vehicles={m.vehicles.map((v) => ({ typeName: v.typeName }))} />
                  <div className="text-xs text-slate-400">{m.vehicles.length} רכבים · {totalSoldiers} חיילים · נוצר ע&quot;י {m.createdByName}</div>
                  <div className="grid md:grid-cols-2 gap-2">
                    {m.vehicles.map((v, vi) => (
                      <div key={vi} className="border border-slate-200 rounded-lg p-2">
                        <div className="font-medium text-sm text-slate-700 mb-1">
                          {v.isExternal ? "🔶 " : `${vehicleIcon(v.typeName)} `}{v.label}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {v.soldiers.map((s, si) => (
                            <span key={si} className={`text-[11px] rounded px-2 py-0.5 inline-flex items-center gap-1 ${s.isDriver ? "bg-sky-100 text-sky-800 font-medium" : "bg-slate-100 text-slate-600"}`}>
                              {s.isDriver ? "🚗 " : (roleIcon(s.dispatchRoleId) ? `${roleIcon(s.dispatchRoleId)} ` : "")}{s.name}{s.externalName ? " (חוץ)" : ""}
                              {s.isDriver && !v.isExternal && s.soldierId && (
                                <button
                                  onClick={() => confirmTrip(s.vasId, !s.tripConfirmedAt)}
                                  title={s.tripConfirmedAt ? "הרשאת נסיעה הוקמה — לחץ לביטול" : "טרם דווחה הקמת הרשאה — לחץ לסימון"}
                                  className={s.tripConfirmedAt ? "" : "opacity-70"}
                                >
                                  {s.tripConfirmedAt ? "✅" : "⏳"}
                                </button>
                              )}
                            </span>
                          ))}
                          {v.soldiers.length === 0 && <span className="text-[11px] text-slate-300">אין חיילים</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  {m.notes && <div className="text-xs text-slate-500">📝 {m.notes}</div>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {modal.open && (
        <MissionModal
          companies={companies} vehicles={vehicles} soldiers={soldiers} templates={templates} dispatchRoles={dispatchRoles}
          soldierRoleMap={soldierRoleMap} presentSoldierIds={presentSoldierIds} myCompanyId={myCompanyId}
          edit={modal.edit} reuse={modal.reuse} onClose={() => setModal({ open: false, edit: null })}
        />
      )}
    </div>
  );
}
