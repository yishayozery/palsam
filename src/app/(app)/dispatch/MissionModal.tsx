"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { VehicleIcon, BattalionFlag } from "./ConvoyView";
import { saveMission } from "./actions";

export type MVehicle = { id: string; name: string; serial: string; typeName: string; requiredLicenseIds?: string[]; statusName?: string; statusOk?: boolean; equipment?: string[] };
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
const nextKey = () => `k${++keySeq}`; // מונה מודול — ייחודי לכל קריאה, ללא Date.now (טהור ל-react-compiler)

export default function MissionModal({
  companies, vehicles, soldiers, templates, dispatchRoles = [], soldierRoleMap = {}, presentSoldierIds = [], myCompanyId, battalionLogo = null, edit, reuse, onClose,
}: {
  companies: { id: string; name: string }[];
  vehicles: MVehicle[];
  soldiers: MSoldier[];
  templates: MTemplate[];
  dispatchRoles?: MRole[];
  soldierRoleMap?: Record<string, string[]>;
  presentSoldierIds?: string[];
  myCompanyId: string | null;
  battalionLogo?: string | null;
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
  const [dragKey, setDragKey] = useState<string | null>(null); // גרירה לסידור שיירה
  const [summary, setSummary] = useState<null | "equip" | "roles">(null); // פאנל סיכום

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
  function moveRow(key: string, dir: -1 | 1) { // סדר בשיירה
    setRows((r) => { const i = r.findIndex((x) => x.key === key); const j = i + dir; if (i < 0 || j < 0 || j >= r.length) return r; const next = [...r]; [next[i], next[j]] = [next[j], next[i]]; return next; });
  }
  function reorderRow(fromKey: string, toKey: string) { // גרירה: מזיז fromKey למיקום של toKey
    if (fromKey === toKey) return;
    setRows((r) => { const from = r.findIndex((x) => x.key === fromKey); const to = r.findIndex((x) => x.key === toKey); if (from < 0 || to < 0) return r; const next = [...r]; const [m] = next.splice(from, 1); next.splice(to, 0, m); return next; });
  }
  const vehStatusBad = (row: VehRow) => row.source === "system" && !!row.vehicleSerialUnitId && vehicles.find((v) => v.id === row.vehicleSerialUnitId)?.statusOk === false;

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

          {/* תצוגת שיירה — רכבים בודדים בסדר, גרירה לסידור + לחיצה לזיהוי */}
          {rows.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-xs text-slate-500 mb-2">השיירה — גרור לסידור · לחץ על רכב לזיהוי:</div>
              <div className="flex flex-wrap items-stretch gap-2">
                {rows.map((row, ri) => {
                  const active = row.key === activeVehKey;
                  const veh = row.source === "system" ? vehicles.find((v) => v.id === row.vehicleSerialUnitId) : undefined;
                  const type = row.source === "external" ? (row.externalVehicleTypeName || "רכב חוץ") : (veh?.typeName || "רכב");
                  const ident = row.source === "external" ? (row.externalVehicleNumber || "—") : (veh?.serial || "—"); // מספר זיהוי
                  const bad = vehStatusBad(row);
                  return (
                    <button key={row.key} draggable onDragStart={() => setDragKey(row.key)} onDragEnd={() => setDragKey(null)}
                      onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragKey) reorderRow(dragKey, row.key); setDragKey(null); }}
                      onClick={() => setActiveVehKey(row.key)} title={`רכב ${ri + 1} · ${type} · ${ident}${bad ? " · לא תקין" : ""} — גרור/לחץ`}
                      className={`relative flex flex-col items-center rounded-lg border px-2 pb-1 pt-4 min-w-[76px] cursor-grab active:cursor-grabbing ${active ? "bg-slate-800 text-white border-slate-800 ring-2 ring-slate-400" : "bg-white border-slate-300 hover:bg-slate-100"} ${bad ? "!border-rose-400" : ""} ${dragKey === row.key ? "opacity-40" : ""}`}>
                      <span className="conv-veh">
                        {row.source === "system" && <BattalionFlag logo={battalionLogo} />}
                        <VehicleIcon name={type} className="text-2xl leading-none" />
                      </span>
                      <span className="text-[10px] opacity-70">רכב {ri + 1}</span>
                      <span className="text-[10px] font-semibold mt-0.5 max-w-[72px] truncate" title={type}>{type}</span>
                      <span className="text-[9px] opacity-70 max-w-[72px] truncate" title={ident}>{row.source === "external" ? "🔶 " : ""}{ident}</span>
                      {bad && <span className="absolute -top-1 -left-1 text-[10px]" title="רכב לא תקין">🔴</span>}
                    </button>
                  );
                })}
              </div>
              {/* #3 — סיכומי ציוד + תפקידים */}
              <div className="flex gap-2 mt-3">
                <button onClick={() => setSummary((s) => (s === "equip" ? null : "equip"))} className={`text-xs rounded-lg px-2.5 py-1 border ${summary === "equip" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-300 hover:bg-slate-50"}`}>📦 סיכום ציוד</button>
                <button onClick={() => setSummary((s) => (s === "roles" ? null : "roles"))} className={`text-xs rounded-lg px-2.5 py-1 border ${summary === "roles" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-300 hover:bg-slate-50"}`}>👥 סיכום חיילים לפי תפקיד</button>
              </div>
              {summary === "equip" && (() => {
                const counts = new Map<string, number>();
                for (const row of rows) if (row.source === "system") for (const name of (vehicles.find((v) => v.id === row.vehicleSerialUnitId)?.equipment ?? [])) counts.set(name, (counts.get(name) ?? 0) + 1);
                const arr = [...counts.entries()].sort((a, b) => b[1] - a[1]);
                return <div className="mt-2 flex flex-wrap gap-1.5 text-xs">{arr.length === 0 ? <span className="text-slate-400">אין ציוד מורכב על רכבי השיירה</span> : arr.map(([n, c]) => <span key={n} className="bg-white border border-slate-200 rounded-full px-2 py-0.5">{n}: <b>{c}</b></span>)}</div>;
              })()}
              {summary === "roles" && (() => {
                const counts = new Map<string, number>(); let none = 0;
                for (const row of rows) for (const s of row.soldiers) { if (s.dispatchRoleId) counts.set(s.dispatchRoleId, (counts.get(s.dispatchRoleId) ?? 0) + 1); else none++; }
                const arr = [...counts.entries()].map(([id, c]) => ({ role: dispatchRoles.find((r) => r.id === id), c })).sort((a, b) => b.c - a.c);
                return <div className="mt-2 flex flex-wrap gap-1.5 text-xs">{arr.map(({ role, c }) => <span key={role?.id ?? "?"} className="bg-white border border-slate-200 rounded-full px-2 py-0.5">{role?.icon} {role?.name ?? "—"}: <b>{c}</b></span>)}{none > 0 && <span className="bg-white border border-slate-200 rounded-full px-2 py-0.5 text-slate-500">ללא תפקיד: <b>{none}</b></span>}</div>;
              })()}
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
                          {row.source === "external" && !row.externalVehicleNumber.trim() && <span title="חסר מספר רכב">⚠️</span>}
                          {unq && <span title="נהג לא מוסמך">🔴</span>}
                          {vehStatusBad(row) && <span title="רכב לא תקין">🔧</span>}
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
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                        <span className="font-bold text-sm text-slate-700 flex items-center gap-1">
                          <span className="bg-slate-800 text-white rounded-full w-5 h-5 inline-flex items-center justify-center text-[10px]" title="מיקום בשיירה">{ri + 1}</span>
                          רכב {ri + 1} {row.source === "external" && <span className="text-amber-600">· חוץ</span>}
                        </span>
                        <div className="flex items-center gap-1">
                          <button disabled={ri === 0} onClick={() => moveRow(row.key, -1)} title="הזז למעלה בשיירה" className="text-xs border border-slate-300 rounded px-1.5 disabled:opacity-30">↑</button>
                          <button disabled={ri === rows.length - 1} onClick={() => moveRow(row.key, 1)} title="הזז למטה בשיירה" className="text-xs border border-slate-300 rounded px-1.5 disabled:opacity-30">↓</button>
                          <button onClick={() => patchRow(row.key, { source: row.source === "system" ? "external" : "system", vehicleSerialUnitId: "", externalVehicleNumber: "", externalVehicleTypeName: "" })}
                            className="text-[11px] text-indigo-600 hover:text-indigo-800">{row.source === "system" ? "↔ לרכב חוץ" : "↔ לרכב מהמערכת"}</button>
                          <button onClick={() => removeRow(row.key)} className="text-xs text-rose-500 hover:text-rose-700">הסר</button>
                        </div>
                      </div>
                      {row.source === "system" ? (() => {
                        const selVeh = vehicles.find((v) => v.id === row.vehicleSerialUnitId);
                        const bad = selVeh?.statusOk === false;
                        return (
                        <div className="mb-2">
                          <select value={row.vehicleSerialUnitId} onChange={(e) => patchRow(row.key, { vehicleSerialUnitId: e.target.value })}
                            className={`w-full border rounded-lg px-2 py-1.5 text-sm bg-white ${bad ? "border-rose-400 bg-rose-50" : "border-slate-300"}`}>
                            <option value="">— בחר רכב —</option>
                            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.statusOk === false ? "🔴 " : ""}{v.name} · {v.serial}{v.statusOk === false ? ` — לא תקין (${v.statusName})` : ""}</option>)}
                          </select>
                          {/* #4 — סטטוס רכב לא תקין */}
                          {bad && <p className="text-[11px] text-rose-600 mt-1 font-medium">🔴 הרכב אינו תקין ({selVeh?.statusName}) — יישלח דיווח לקצין רכב עם רשימת הנהגים</p>}
                          {/* #5 — ציוד מורכב על הרכב */}
                          {selVeh && (selVeh.equipment?.length ?? 0) > 0 && (
                            <div className="mt-1.5 text-[11px] text-slate-600"><span className="text-slate-400">📦 ציוד על הרכב: </span>{[...new Map((selVeh.equipment ?? []).map((n) => [n, (selVeh.equipment ?? []).filter((x) => x === n).length])).entries()].map(([n, c]) => `${n}${c > 1 ? ` ×${c}` : ""}`).join(" · ")}</div>
                          )}
                        </div>
                        );
                      })() : (
                        <div className="mb-2">
                          <div className="grid grid-cols-2 gap-2">
                            <input value={row.externalVehicleNumber} onChange={(e) => patchRow(row.key, { externalVehicleNumber: e.target.value })}
                              placeholder="מספר רכב (חובה)"
                              className={`border rounded-lg px-2 py-1.5 text-sm ${row.externalVehicleNumber.trim() ? "border-slate-300" : "border-rose-400 bg-rose-50"}`} />
                            <input value={row.externalVehicleTypeName} onChange={(e) => patchRow(row.key, { externalVehicleTypeName: e.target.value })}
                              placeholder="סוג רכב (למשל האמר)" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                          </div>
                          {!row.externalVehicleNumber.trim() && <p className="text-[11px] text-rose-600 mt-1">⚠️ רכב חוץ — חובה למלא מספר רכב</p>}
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
