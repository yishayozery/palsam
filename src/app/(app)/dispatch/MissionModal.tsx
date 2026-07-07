"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ConvoyView from "./ConvoyView";
import { saveMission } from "./actions";

export type MVehicle = { id: string; name: string; serial: string; typeName: string };
export type MSoldier = { id: string; fullName: string; personalNumber: string };
export type MTemplate = { id: string; name: string; vehicleSerialUnitId: string; vehicleTypeName: string; soldierIds: string[] };

type VehSoldier = { key: string; soldierId: string | null; externalName: string; externalPersonalNumber: string; isDriver: boolean };
type VehRow = {
  key: string;
  source: "system" | "external";
  vehicleSerialUnitId: string;
  externalVehicleNumber: string;
  externalVehicleTypeName: string;
  soldiers: VehSoldier[];
};

export type EditMission = {
  id: string;
  title: string | null;
  companyId: string | null;
  commanderSoldierId: string | null;
  commanderName: string | null;
  missionDate: string;
  departureTime: string;
  notes: string | null;
  vehicles: {
    isExternal: boolean;
    vehicleSerialUnitId: string | null;
    externalVehicleNumber: string | null;
    externalVehicleTypeName: string | null;
    soldiers: { soldierId: string | null; externalName: string | null; externalPersonalNumber: string | null; isDriver: boolean }[];
  }[];
};

let keySeq = 0;
const nextKey = () => `k${++keySeq}_${Date.now()}`;

export default function MissionModal({
  companies, vehicles, soldiers, templates, myCompanyId, edit, onClose,
}: {
  companies: { id: string; name: string }[];
  vehicles: MVehicle[];
  soldiers: MSoldier[];
  templates: MTemplate[];
  myCompanyId: string | null;
  edit?: EditMission | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(edit?.title ?? "");
  const [commanderSoldierId, setCommanderSoldierId] = useState(edit?.commanderSoldierId ?? "");
  const [commanderName, setCommanderName] = useState(edit?.commanderName ?? "");
  const [companyId, setCompanyId] = useState(edit?.companyId ?? myCompanyId ?? "");
  const [missionDate, setMissionDate] = useState(edit?.missionDate ?? new Date().toISOString().slice(0, 10));
  const [departureTime, setDepartureTime] = useState(edit?.departureTime ?? "08:00");
  const [notes, setNotes] = useState(edit?.notes ?? "");

  const [rows, setRows] = useState<VehRow[]>(() => {
    if (edit) {
      return edit.vehicles.map((v) => ({
        key: nextKey(),
        source: v.isExternal ? "external" : "system",
        vehicleSerialUnitId: v.vehicleSerialUnitId ?? "",
        externalVehicleNumber: v.externalVehicleNumber ?? "",
        externalVehicleTypeName: v.externalVehicleTypeName ?? "",
        soldiers: v.soldiers.map((s) => ({
          key: nextKey(), soldierId: s.soldierId, externalName: s.externalName ?? "",
          externalPersonalNumber: s.externalPersonalNumber ?? "", isDriver: s.isDriver,
        })),
      }));
    }
    return [];
  });

  const soldierName = (id: string) => soldiers.find((s) => s.id === id)?.fullName ?? "—";
  const vehicleName = (id: string) => { const v = vehicles.find((x) => x.id === id); return v ? `${v.name} · ${v.serial}` : "—"; };

  function addSystemVehicle() {
    setRows((r) => [...r, { key: nextKey(), source: "system", vehicleSerialUnitId: "", externalVehicleNumber: "", externalVehicleTypeName: "", soldiers: [] }]);
  }
  function addExternalVehicle() {
    setRows((r) => [...r, { key: nextKey(), source: "external", vehicleSerialUnitId: "", externalVehicleNumber: "", externalVehicleTypeName: "", soldiers: [] }]);
  }
  function addFromTemplate(tid: string) {
    const t = templates.find((x) => x.id === tid);
    if (!t) return;
    setRows((r) => [...r, {
      key: nextKey(), source: "system", vehicleSerialUnitId: t.vehicleSerialUnitId,
      externalVehicleNumber: "", externalVehicleTypeName: "",
      soldiers: t.soldierIds.map((sid, i) => ({ key: nextKey(), soldierId: sid, externalName: "", externalPersonalNumber: "", isDriver: i === 0 })),
    }]);
  }
  function removeRow(key: string) { setRows((r) => r.filter((x) => x.key !== key)); }
  function patchRow(key: string, patch: Partial<VehRow>) { setRows((r) => r.map((x) => x.key === key ? { ...x, ...patch } : x)); }

  function addSoldier(rowKey: string, soldierId: string) {
    if (!soldierId) return;
    setRows((r) => r.map((x) => {
      if (x.key !== rowKey) return x;
      if (x.soldiers.some((s) => s.soldierId === soldierId)) return x;
      const isFirst = x.soldiers.length === 0;
      return { ...x, soldiers: [...x.soldiers, { key: nextKey(), soldierId, externalName: "", externalPersonalNumber: "", isDriver: isFirst }] };
    }));
  }
  function addExternalSoldier(rowKey: string) {
    setRows((r) => r.map((x) => x.key === rowKey
      ? { ...x, soldiers: [...x.soldiers, { key: nextKey(), soldierId: null, externalName: "", externalPersonalNumber: "", isDriver: x.soldiers.length === 0 }] }
      : x));
  }
  function removeSoldier(rowKey: string, sKey: string) {
    setRows((r) => r.map((x) => x.key === rowKey ? { ...x, soldiers: x.soldiers.filter((s) => s.key !== sKey) } : x));
  }
  function setDriver(rowKey: string, sKey: string) {
    setRows((r) => r.map((x) => x.key === rowKey ? { ...x, soldiers: x.soldiers.map((s) => ({ ...s, isDriver: s.key === sKey })) } : x));
  }
  function patchSoldier(rowKey: string, sKey: string, patch: Partial<VehSoldier>) {
    setRows((r) => r.map((x) => x.key === rowKey ? { ...x, soldiers: x.soldiers.map((s) => s.key === sKey ? { ...s, ...patch } : s) } : x));
  }

  const convoyPreview = rows.map((row) => ({
    typeName: row.source === "external"
      ? (row.externalVehicleTypeName || "רכב חוץ")
      : (vehicles.find((v) => v.id === row.vehicleSerialUnitId)?.typeName || "רכב"),
  }));

  function submit() {
    setError(null);
    if (rows.length === 0) { setError("הוסף לפחות רכב אחד"); return; }
    const payload = {
      id: edit?.id,
      title: title.trim() || null,
      companyId: companyId || null,
      commanderSoldierId: commanderSoldierId || null,
      commanderName: commanderSoldierId ? null : (commanderName.trim() || null),
      missionDate, departureTime,
      notes: notes.trim() || null,
      vehicles: rows.map((row) => ({
        vehicleSerialUnitId: row.source === "system" ? (row.vehicleSerialUnitId || null) : null,
        isExternal: row.source === "external",
        externalVehicleNumber: row.source === "external" ? row.externalVehicleNumber.trim() : null,
        externalVehicleTypeName: row.source === "external" ? row.externalVehicleTypeName.trim() : null,
        soldiers: row.soldiers.map((s) => s.soldierId
          ? { soldierId: s.soldierId, isDriver: s.isDriver }
          : { externalName: s.externalName.trim(), externalPersonalNumber: s.externalPersonalNumber.trim(), isDriver: s.isDriver }),
      })),
    };
    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));
    start(async () => {
      const res = await saveMission(fd);
      if (res.error) { setError(res.error); return; }
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-4">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white rounded-t-2xl z-10">
          <h3 className="font-bold text-lg">🚗 {edit ? "עריכת משימה" : "משימה חדשה"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {/* פרטי משימה */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="text-sm">תאריך
              <input type="date" value={missionDate} onChange={(e) => setMissionDate(e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </label>
            <label className="text-sm">שעת יציאה
              <input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </label>
            <label className="text-sm">כותרת (אופציונלי)
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: פינוי בוקר"
                className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </label>
            <label className="text-sm">פלוגה
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                <option value="">— ללא —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="text-sm">מפקד משימה
              <select value={commanderSoldierId} onChange={(e) => { setCommanderSoldierId(e.target.value); if (e.target.value) setCommanderName(""); }}
                className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                <option value="">— בחר חייל —</option>
                {soldiers.map((s) => <option key={s.id} value={s.id}>{s.fullName}{s.personalNumber ? ` (${s.personalNumber})` : ""}</option>)}
              </select>
            </label>
            {!commanderSoldierId && (
              <label className="text-sm">או מפקד חוץ (שם)
                <input value={commanderName} onChange={(e) => setCommanderName(e.target.value)} placeholder="שם חופשי"
                  className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
              </label>
            )}
          </div>

          {/* תצוגת שיירה */}
          {convoyPreview.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-xs text-slate-500 mb-1">השיירה:</div>
              <ConvoyView vehicles={convoyPreview} />
            </div>
          )}

          {/* רכבים */}
          <div className="space-y-3">
            {rows.map((row, ri) => (
              <div key={row.key} className="border border-slate-200 rounded-xl p-3 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm text-slate-700">רכב {ri + 1} {row.source === "external" && <span className="text-amber-600">· חוץ</span>}</span>
                  <button onClick={() => removeRow(row.key)} className="text-xs text-rose-500 hover:text-rose-700">הסר רכב</button>
                </div>
                {row.source === "system" ? (
                  <select value={row.vehicleSerialUnitId} onChange={(e) => patchRow(row.key, { vehicleSerialUnitId: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white mb-2">
                    <option value="">— בחר רכב —</option>
                    {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.serial}</option>)}
                  </select>
                ) : (
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input value={row.externalVehicleNumber} onChange={(e) => patchRow(row.key, { externalVehicleNumber: e.target.value })}
                      placeholder="מספר רכב" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                    <input value={row.externalVehicleTypeName} onChange={(e) => patchRow(row.key, { externalVehicleTypeName: e.target.value })}
                      placeholder="סוג רכב (למשל האמר)" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                )}

                {/* חיילים */}
                <div className="space-y-1.5">
                  {row.soldiers.map((s) => (
                    <div key={s.key} className="flex items-center gap-2 flex-wrap bg-slate-50 rounded-lg px-2 py-1.5">
                      <label className="flex items-center gap-1 text-xs" title="נהג — יקבל הודעת בוט">
                        <input type="radio" name={`driver-${row.key}`} checked={s.isDriver} onChange={() => setDriver(row.key, s.key)} />
                        🚗
                      </label>
                      {s.soldierId ? (
                        <span className="text-sm flex-1">{soldierName(s.soldierId)}</span>
                      ) : (
                        <div className="flex gap-1 flex-1">
                          <input value={s.externalName} onChange={(e) => patchSoldier(row.key, s.key, { externalName: e.target.value })}
                            placeholder="שם חייל חוץ" className="border border-slate-300 rounded px-1.5 py-0.5 text-sm flex-1" />
                          <input value={s.externalPersonalNumber} onChange={(e) => patchSoldier(row.key, s.key, { externalPersonalNumber: e.target.value })}
                            placeholder="מ.א" className="border border-slate-300 rounded px-1.5 py-0.5 text-sm w-24" />
                        </div>
                      )}
                      {s.isDriver && <span className="text-[10px] text-sky-600">נהג</span>}
                      <button onClick={() => removeSoldier(row.key, s.key)} className="text-xs text-rose-400 hover:text-rose-600">✕</button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <select value="" onChange={(e) => { addSoldier(row.key, e.target.value); e.target.value = ""; }}
                    className="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white">
                    <option value="">+ הוסף חייל מהיחידה</option>
                    {soldiers.filter((s) => !row.soldiers.some((rs) => rs.soldierId === s.id)).map((s) =>
                      <option key={s.id} value={s.id}>{s.fullName}{s.personalNumber ? ` (${s.personalNumber})` : ""}</option>)}
                  </select>
                  <button onClick={() => addExternalSoldier(row.key)} className="text-xs text-amber-700 border border-amber-300 rounded-lg px-2 py-1 hover:bg-amber-50">+ חייל חוץ</button>
                </div>
              </div>
            ))}
          </div>

          {/* הוספת רכבים */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={addSystemVehicle} className="text-sm bg-slate-800 text-white rounded-lg px-3 py-1.5 hover:bg-slate-900">+ רכב מהמערכת</button>
            <button onClick={addExternalVehicle} className="text-sm bg-amber-600 text-white rounded-lg px-3 py-1.5 hover:bg-amber-700">+ רכב חוץ</button>
            {templates.length > 0 && (
              <select value="" onChange={(e) => { addFromTemplate(e.target.value); e.target.value = ""; }}
                className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
                <option value="">+ מרשימת שבצ&quot;ק קבוע</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.vehicleTypeName}</option>)}
              </select>
            )}
          </div>

          <label className="text-sm block">הערות
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          </label>

          {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t sticky bottom-0 bg-white rounded-b-2xl">
          <button onClick={onClose} className="text-sm text-slate-600 px-4 py-2 hover:bg-slate-50 rounded-lg">ביטול</button>
          <button onClick={submit} disabled={pending} className="text-sm bg-emerald-600 text-white rounded-lg px-5 py-2 font-medium hover:bg-emerald-700 disabled:opacity-50">
            {pending ? "שומר…" : edit ? "עדכן משימה" : "צור משימה"}
          </button>
        </div>
      </div>
    </div>
  );
}
