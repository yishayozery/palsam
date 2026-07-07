"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import ConvoyView from "./ConvoyView";
import MissionModal, { type MVehicle, type MSoldier, type MTemplate, type EditMission } from "./MissionModal";
import { toggleMissionComplete, deleteMission } from "./actions";

type MSoldierFull = { soldierId: string | null; externalName: string | null; externalPersonalNumber: string | null; isDriver: boolean; name: string; pn: string | null };
type MVehicleFull = {
  isExternal: boolean; vehicleSerialUnitId: string | null; externalVehicleNumber: string | null; externalVehicleTypeName: string | null;
  label: string; typeName: string; soldiers: MSoldierFull[];
};
export type MissionFull = {
  id: string; title: string | null; companyId: string | null; companyName: string | null;
  missionDate: string; departureTime: string; notes: string | null; completedAt: string | null; createdByName: string;
  vehicles: MVehicleFull[];
};

export default function MissionsSection({
  missions, companies, vehicles, soldiers, templates, myCompanyId,
}: {
  missions: MissionFull[];
  companies: { id: string; name: string }[];
  vehicles: MVehicle[];
  soldiers: MSoldier[];
  templates: MTemplate[];
  myCompanyId: string | null;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [modal, setModal] = useState<{ open: boolean; edit: EditMission | null }>({ open: false, edit: null });

  function openNew() { setModal({ open: true, edit: null }); }
  function openEdit(m: MissionFull) {
    setModal({ open: true, edit: {
      id: m.id, title: m.title, companyId: m.companyId, missionDate: m.missionDate, departureTime: m.departureTime, notes: m.notes,
      vehicles: m.vehicles.map((v) => ({
        isExternal: v.isExternal, vehicleSerialUnitId: v.vehicleSerialUnitId,
        externalVehicleNumber: v.externalVehicleNumber, externalVehicleTypeName: v.externalVehicleTypeName,
        soldiers: v.soldiers.map((s) => ({ soldierId: s.soldierId, externalName: s.externalName, externalPersonalNumber: s.externalPersonalNumber, isDriver: s.isDriver })),
      })),
    } });
  }
  function act(fn: (fd: FormData) => Promise<{ ok?: boolean; error?: string }>, id: string, extra?: Record<string, string>) {
    const fd = new FormData(); fd.set("id", id);
    if (extra) for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    start(async () => { await fn(fd); router.refresh(); });
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <h2 className="font-bold text-slate-700">🚚 משימות (שיירות)</h2>
        <button onClick={openNew} className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 font-medium">+ משימה חדשה</button>
      </div>

      {missions.length === 0 ? (
        <Card className="p-5 text-center text-slate-400 text-sm">אין משימות. לחץ &quot;+ משימה חדשה&quot; כדי לפתוח שיירה עם רכב אחד או יותר.</Card>
      ) : (
        <div className="space-y-3">
          {missions.map((m) => {
            const totalSoldiers = m.vehicles.reduce((n, v) => n + v.soldiers.length, 0);
            return (
              <Card key={m.id} className={`overflow-hidden ${m.completedAt ? "opacity-60" : ""}`}>
                <div className="bg-slate-100 px-4 py-2 flex items-center justify-between gap-2 flex-wrap border-b border-slate-200">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800">{m.title || "משימה"}</span>
                    <span className="text-xs text-slate-500">{new Date(m.missionDate).toLocaleDateString("he-IL")} · {m.departureTime}</span>
                    {m.companyName && <span className="text-xs bg-white border border-slate-200 rounded px-2 py-0.5">{m.companyName}</span>}
                    {m.completedAt && <span className="text-[11px] text-emerald-700 bg-emerald-50 rounded px-2 py-0.5">✓ הסתיימה</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(m)} className="text-xs text-slate-600 hover:underline">✏️ עריכה</button>
                    <button onClick={() => act(toggleMissionComplete, m.id, { completed: m.completedAt ? "false" : "true" })}
                      className="text-xs text-emerald-700 hover:underline">{m.completedAt ? "↩︎ פתח מחדש" : "✓ סיים"}</button>
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
                          {v.isExternal ? "🔶 " : "🚗 "}{v.label}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {v.soldiers.map((s, si) => (
                            <span key={si} className={`text-[11px] rounded px-2 py-0.5 ${s.isDriver ? "bg-sky-100 text-sky-800 font-medium" : "bg-slate-100 text-slate-600"}`}>
                              {s.isDriver && "🚗 "}{s.name}{s.externalName ? " (חוץ)" : ""}
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
          companies={companies} vehicles={vehicles} soldiers={soldiers} templates={templates} myCompanyId={myCompanyId}
          edit={modal.edit} onClose={() => setModal({ open: false, edit: null })}
        />
      )}
    </div>
  );
}
