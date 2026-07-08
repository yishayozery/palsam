"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ConvoyView from "./ConvoyView";
import { saveMission } from "./actions";

export type MVehicle = { id: string; name: string; serial: string; typeName: string; requiredLicenseIds?: string[] };
export type MSoldier = { id: string; fullName: string; personalNumber: string; licenseIds?: string[]; procValid?: boolean; refreshValid?: boolean };
export type MTemplate = { id: string; name: string; vehicleSerialUnitId: string; vehicleTypeName: string; soldierIds: string[]; soldiers?: { soldierId: string; dispatchRoleId: string; isDriver: boolean }[] };
export type MRole = { id: string; name: string; icon: string; isDriver: boolean };

type VehSoldier = { key: string; soldierId: string | null; externalName: string; externalPersonalNumber: string; isDriver: boolean; dispatchRoleId: string | null };
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
    soldiers: { soldierId: string | null; externalName: string | null; externalPersonalNumber: string | null; isDriver: boolean; dispatchRoleId?: string | null }[];
  }[];
};

let keySeq = 0;
const nextKey = () => `k${++keySeq}_${Date.now()}`;

export default function MissionModal({
  companies, vehicles, soldiers, templates, dispatchRoles = [], soldierRoleMap = {}, presentSoldierIds = [], myCompanyId, edit, reuse, onClose,
}: {
  companies: { id: string; name: string }[];
  vehicles: MVehicle[];
  soldiers: MSoldier[];
  templates: MTemplate[];
  dispatchRoles?: MRole[];
  soldierRoleMap?: Record<string, string[]>;
  presentSoldierIds?: string[];
  myCompanyId: string | null;
  edit?: EditMission | null;
  reuse?: boolean;
  onClose: () => void;
}) {
  const isEdit = !!edit && !reuse;
  const presentSet = new Set(presentSoldierIds);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [driverWarning, setDriverWarning] = useState<{ reasons: string[]; name: string; onConfirm: () => void } | null>(null);
  const [activeVehKey, setActiveVehKey] = useState<string | null>(null);
  const [addRoleId, setAddRoleId] = useState(""); // תפקיד נבחר לתהליך "בחר תפקיד ואז חייל"

  // בדיקת הסמכת נהג (רק לרכב מערכת) — רישיון לסוג הרכב + נוהל נהיגה + ריענון
  function driverReasons(soldierId: string | null, row: VehRow): string[] {
    if (!soldierId || row.source === "external") return [];
    const s = soldiers.find((x) => x.id === soldierId);
    if (!s) return [];
    const veh = vehicles.find((v) => v.id === row.vehicleSerialUnitId);
    const req = veh?.requiredLicenseIds ?? [];
    const has = new Set(s.licenseIds ?? []);
    const reasons: string[] = [];
    if (req.some((id) => !has.has(id))) reasons.push("חסר רישיון/היתר לסוג הרכב");
    if (s.procValid === false) reasons.push("לא חתם על נוהל נהיגה (בתוקף)");
    if (s.refreshValid === false) reasons.push("ריענון נהיגה לא בתוקף");
    return reasons;
  }

  const [title, setTitle] = useState(edit?.title ?? "");
  const [commanderSoldierId, setCommanderSoldierId] = useState(edit?.commanderSoldierId ?? "");
  const [commanderName, setCommanderName] = useState(edit?.commanderName ?? "");
  const [missionDate, setMissionDate] = useState((isEdit ? edit?.missionDate : null) ?? new Date().toISOString().slice(0, 10));
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
          externalPersonalNumber: s.externalPersonalNumber ?? "", isDriver: s.isDriver, dispatchRoleId: s.dispatchRoleId ?? null,
        })),
      }));
    }
    return [];
  });

  const soldierName = (id: string) => soldiers.find((s) => s.id === id)?.fullName ?? "—";
  const vehicleName = (id: string) => { const v = vehicles.find((x) => x.id === id); return v ? `${v.name} · ${v.serial}` : "—"; };

  function addSystemVehicle() {
    const k = nextKey();
    setRows((r) => [...r, { key: k, source: "system", vehicleSerialUnitId: "", externalVehicleNumber: "", externalVehicleTypeName: "", soldiers: [] }]);
    setActiveVehKey(k);
  }
  function addExternalVehicle() {
    const k = nextKey();
    setRows((r) => [...r, { key: k, source: "external", vehicleSerialUnitId: "", externalVehicleNumber: "", externalVehicleTypeName: "", soldiers: [] }]);
    setActiveVehKey(k);
  }
  function addFromTemplate(tid: string) {
    const t = templates.find((x) => x.id === tid);
    if (!t) return;
    const k = nextKey();
    const crew = t.soldiers && t.soldiers.length > 0
      ? t.soldiers.map((s) => ({ key: nextKey(), soldierId: s.soldierId, externalName: "", externalPersonalNumber: "", isDriver: s.isDriver, dispatchRoleId: s.dispatchRoleId }))
      : t.soldierIds.map((sid, i) => ({ key: nextKey(), soldierId: sid, externalName: "", externalPersonalNumber: "", isDriver: i === 0, dispatchRoleId: null as string | null }));
    setRows((r) => [...r, {
      key: k, source: "system", vehicleSerialUnitId: t.vehicleSerialUnitId,
      externalVehicleNumber: "", externalVehicleTypeName: "",
      soldiers: crew,
    }]);
    setActiveVehKey(k);
  }
  function removeRow(key: string) {
    setRows((r) => {
      const next = r.filter((x) => x.key !== key);
      setActiveVehKey((cur) => (cur === key ? (next[next.length - 1]?.key ?? null) : cur));
      return next;
    });
  }
  function patchRow(key: string, patch: Partial<VehRow>) { setRows((r) => r.map((x) => x.key === key ? { ...x, ...patch } : x)); }

  function addSoldier(rowKey: string, soldierId: string, roleId: string | null = null) {
    if (!soldierId) return;
    const role = roleId ? dispatchRoles.find((r) => r.id === roleId) : null;
    setRows((r) => r.map((x) => {
      if (x.key !== rowKey) return x;
      if (x.soldiers.some((s) => s.soldierId === soldierId)) return x;
      const isDriver = role ? role.isDriver : x.soldiers.length === 0;
      const others = isDriver && role?.isDriver ? x.soldiers.map((s) => ({ ...s, isDriver: false })) : x.soldiers; // נהג יחיד
      return { ...x, soldiers: [...others, { key: nextKey(), soldierId, externalName: "", externalPersonalNumber: "", isDriver, dispatchRoleId: roleId }] };
    }));
  }
  // מיון החיילים בבורר ההוספה: מותאמים-לתפקיד קודם, ואז נוכחים קודם (התראה בלבד — כולם נבחרים)
  function soldiersForAdd(row: VehRow, roleId: string) {
    const avail = soldiers.filter((s) => !row.soldiers.some((rs) => rs.soldierId === s.id));
    const score = (s: MSoldier) => (roleId && soldierRoleMap[s.id]?.includes(roleId) ? 0 : 1) * 2 + (presentSet.has(s.id) ? 0 : 1);
    return [...avail].sort((a, b) => score(a) - score(b) || a.fullName.localeCompare(b.fullName, "he"));
  }
  function addExternalSoldier(rowKey: string) {
    setRows((r) => r.map((x) => x.key === rowKey
      ? { ...x, soldiers: [...x.soldiers, { key: nextKey(), soldierId: null, externalName: "", externalPersonalNumber: "", isDriver: x.soldiers.length === 0, dispatchRoleId: null }] }
      : x));
  }
  function removeSoldier(rowKey: string, sKey: string) {
    setRows((r) => r.map((x) => x.key === rowKey ? { ...x, soldiers: x.soldiers.filter((s) => s.key !== sKey) } : x));
  }
  function setDriver(rowKey: string, sKey: string) {
    const row = rows.find((r) => r.key === rowKey);
    const sol = row?.soldiers.find((s) => s.key === sKey);
    const apply = () => setRows((r) => r.map((x) => x.key === rowKey ? { ...x, soldiers: x.soldiers.map((s) => ({ ...s, isDriver: s.key === sKey })) } : x));
    const reasons = row ? driverReasons(sol?.soldierId ?? null, row) : [];
    if (reasons.length) setDriverWarning({ reasons, name: sol?.soldierId ? soldierName(sol.soldierId) : "נהג", onConfirm: apply });
    else apply();
  }
  function setRole(rowKey: string, sKey: string, roleId: string) {
    const role = dispatchRoles.find((r) => r.id === roleId);
    setRows((r) => r.map((x) => x.key !== rowKey ? x : {
      ...x,
      // תפקיד נהג → נהג הרכב (יחיד); תפקיד אחר → מבטל נהג (וכך גם התראת אי-כשירות); ריק → משאיר קיים
      soldiers: x.soldiers.map((s) => {
        if (s.key === sKey) return { ...s, dispatchRoleId: roleId || null, isDriver: role ? role.isDriver : s.isDriver };
        return role?.isDriver ? { ...s, isDriver: false } : s; // נהג אחד לרכב
      }),
    }));
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
      id: isEdit ? edit?.id : undefined,
      title: title.trim() || null,
      companyId: null,
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
          ? { soldierId: s.soldierId, isDriver: s.isDriver, dispatchRoleId: s.dispatchRoleId }
          : { externalName: s.externalName.trim(), externalPersonalNumber: s.externalPersonalNumber.trim(), isDriver: s.isDriver, dispatchRoleId: s.dispatchRoleId }),
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
          <h3 className="font-bold text-lg">🚗 {isEdit ? "עריכת משימה" : reuse ? "שיבוץ מחדש" : "משימה חדשה"}</h3>
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
            <label className="text-sm">שם המשימה
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: פינוי בוקר / ליווי שיירה"
                className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </label>
            <label className="text-sm">מפקד אחראי
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

          {/* הוספת רכבים — למעלה, כדי למעט גלילה */}
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

          {/* תצוגת שיירה */}
          {convoyPreview.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-xs text-slate-500 mb-1">השיירה:</div>
              <ConvoyView vehicles={convoyPreview} />
            </div>
          )}

          {/* רכבים — טאב לכל רכב */}
          {rows.length > 0 && (() => {
            const activeRow = rows.find((r) => r.key === activeVehKey) ?? rows[0];
            const totalSoldiers = rows.reduce((n, r) => n + r.soldiers.length, 0);
            const rowUnqualified = (row: VehRow) => row.soldiers.some((s) => s.isDriver && driverReasons(s.soldierId, row).length > 0);
            return (
              <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
                {/* סיכום + טאבים */}
                <div className="bg-slate-50 border-b border-slate-200 px-3 py-2">
                  <div className="text-xs text-slate-500 mb-1.5">{rows.length} רכבים · {totalSoldiers} חיילים משובצים</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {rows.map((row, ri) => {
                      const isActive = row.key === activeRow.key;
                      const unq = rowUnqualified(row);
                      return (
                        <button key={row.key} onClick={() => setActiveVehKey(row.key)}
                          className={`text-xs rounded-lg px-2.5 py-1 border flex items-center gap-1 ${isActive ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100"}`}>
                          {row.source === "external" ? "🔶" : "🚗"} רכב {ri + 1}
                          <span className={`rounded-full px-1.5 text-[10px] ${isActive ? "bg-white/25" : "bg-slate-100"}`}>{row.soldiers.length}</span>
                          {unq && <span title="נהג לא מוסמך">🔴</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* פאנל הרכב הפעיל */}
                {(() => {
                  const row = activeRow;
                  const ri = rows.findIndex((r) => r.key === row.key);
                  return (
                    <div className="p-3">
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
                              <span className="text-sm flex-1 flex items-center gap-1">
                                {soldierName(s.soldierId)}
                                {!presentSet.has(s.soldierId) && <span title="לא נוכח היום — התראה בלבד" className="text-[9px] bg-amber-100 text-amber-700 border border-amber-300 rounded px-1 whitespace-nowrap">⚠️ לא נוכח</span>}
                              </span>
                            ) : (
                              <div className="flex gap-1 flex-1">
                                <input value={s.externalName} onChange={(e) => patchSoldier(row.key, s.key, { externalName: e.target.value })}
                                  placeholder="שם חייל חוץ" className="border border-slate-300 rounded px-1.5 py-0.5 text-sm flex-1" />
                                <input value={s.externalPersonalNumber} onChange={(e) => patchSoldier(row.key, s.key, { externalPersonalNumber: e.target.value })}
                                  placeholder="מ.א" className="border border-slate-300 rounded px-1.5 py-0.5 text-sm w-24" />
                              </div>
                            )}
                            {dispatchRoles.length > 0 && (
                              <select value={s.dispatchRoleId ?? ""} onChange={(e) => setRole(row.key, s.key, e.target.value)}
                                className="border border-slate-300 rounded px-1.5 py-0.5 text-xs bg-white" title="תפקיד בשבצ״ק">
                                <option value="">תפקיד…</option>
                                {dispatchRoles.map((role) => <option key={role.id} value={role.id}>{role.icon} {role.name}</option>)}
                              </select>
                            )}
                            {s.isDriver && <span className="text-[10px] text-sky-600">נהג</span>}
                            {s.isDriver && (() => { const rz = driverReasons(s.soldierId, row); return rz.length ? <span title={rz.join(" · ")} className="text-[10px] bg-rose-600 text-white rounded px-1.5 py-0.5 font-bold">🔴 לא מוסמך</span> : null; })()}
                            <button onClick={() => removeSoldier(row.key, s.key)} className="text-xs text-rose-400 hover:text-rose-600">✕</button>
                          </div>
                        ))}
                        {row.soldiers.length === 0 && <div className="text-xs text-slate-300 px-1">אין חיילים משובצים ברכב זה</div>}
                      </div>

                      {/* הוספת חייל — קודם בוחרים תפקיד, ואז חייל (מותאמים לתפקיד + נוכחים קודם) */}
                      <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 p-2">
                        <div className="text-[11px] text-slate-500 mb-1">הוספת חייל — בחר תפקיד ואז חייל:</div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {dispatchRoles.length > 0 && (
                            <select value={addRoleId} onChange={(e) => setAddRoleId(e.target.value)}
                              className="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white" title="1. בחר תפקיד">
                              <option value="">כל התפקידים</option>
                              {dispatchRoles.map((role) => <option key={role.id} value={role.id}>{role.icon} {role.name}</option>)}
                            </select>
                          )}
                          <select value="" onChange={(e) => { addSoldier(row.key, e.target.value, addRoleId || null); e.target.value = ""; }}
                            className="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white" title="2. בחר חייל">
                            <option value="">+ הוסף חייל{addRoleId ? ` (${dispatchRoles.find((r) => r.id === addRoleId)?.name})` : ""}</option>
                            {soldiersForAdd(row, addRoleId).map((s) => {
                              const present = presentSet.has(s.id);
                              const matched = addRoleId ? (soldierRoleMap[s.id]?.includes(addRoleId) ?? false) : true;
                              return <option key={s.id} value={s.id}>{present ? "" : "⚠️ "}{matched ? "" : "○ "}{s.fullName}{s.personalNumber ? ` (${s.personalNumber})` : ""}{present ? "" : " — לא נוכח"}</option>;
                            })}
                          </select>
                          <button onClick={() => addExternalSoldier(row.key)} className="text-xs text-amber-700 border border-amber-300 rounded-lg px-2 py-1 hover:bg-amber-50">+ חייל חוץ</button>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">⚠️ = לא נוכח היום · ○ = לא משובץ לתפקיד זה בשבצ״ק קבוע (התראה בלבד — ניתן לשבץ)</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          <label className="text-sm block">הערות
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          </label>

          {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t sticky bottom-0 bg-white rounded-b-2xl">
          <button onClick={onClose} className="text-sm text-slate-600 px-4 py-2 hover:bg-slate-50 rounded-lg">ביטול</button>
          <button onClick={submit} disabled={pending} className="text-sm bg-emerald-600 text-white rounded-lg px-5 py-2 font-medium hover:bg-emerald-700 disabled:opacity-50">
            {pending ? "שומר…" : isEdit ? "עדכן משימה" : "צור משימה"}
          </button>
        </div>
      </div>

      {/* פופ-אפ אזהרה: נהג לא מוסמך */}
      {driverWarning && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setDriverWarning(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-bold text-rose-600 mb-2">🔴 נהג לא מוסמך</div>
            <div className="text-sm text-slate-700 mb-3">
              <span className="font-medium">{driverWarning.name}</span> אינו מוסמך לנהיגה ברכב זה:
            </div>
            <ul className="text-sm text-rose-700 list-disc pr-5 space-y-1 mb-4">
              {driverWarning.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setDriverWarning(null)} className="text-sm text-slate-600 px-4 py-2 hover:bg-slate-50 rounded-lg">ביטול</button>
              <button onClick={() => { driverWarning.onConfirm(); setDriverWarning(null); }}
                className="text-sm bg-rose-600 text-white rounded-lg px-4 py-2 font-medium hover:bg-rose-700">שבץ בכל זאת</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
