"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, EmptyState } from "@/components/ui";
import { useEscClose } from "@/lib/useEscClose";
import { saveAssignment, deleteAssignment, toggleAssignmentComplete } from "./actions";

type Vehicle = {
  id: string; itemTypeId: string; itemName: string; serialNumber: string;
  statusName: string; isWear: boolean; isLoss: boolean;
  holderId: string | null; holderName: string | null; holderKind: string | null;
  requiredLicenseIds: string[];
};
type Soldier = {
  id: string; fullName: string; personalNumber: string | null; phone: string | null;
  companyId: string | null; companyName: string | null;
  licenseIds: string[];
};
type Assignment = {
  id: string;
  vehicleSerialUnitId: string;
  vehicleName: string;
  vehicleSerial: string;
  vehicleCompanyName: string | null;
  companyName: string | null;
  missionDate: string;
  departureTime: string;
  createdByName: string;
  createdAt: string;
  completedAt: string | null;
  soldiers: { id: string; fullName: string; personalNumber: string | null; companyName: string | null }[];
};
type DispatchTpl = {
  id: string;
  name: string;
  vehicleSerialUnitId: string;
  vehicleName: string;
  vehicleSerial: string;
  soldierIds: string[];
};

type Company = { id: string; name: string };

export default function DispatchClient({
  battalionName, myCompanyId, templates = [], vehicles, soldiers, assignments, companies = [],
}: {
  battalionName: string;
  myCompanyId: string | null;
  templates?: DispatchTpl[];
  vehicles: Vehicle[];
  soldiers: Soldier[];
  assignments: Assignment[];
  companies?: Company[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  // 🔍 סינונים בדף הראשי
  const [tab, setTab] = useState<"active" | "completed">("active");
  const [listQuery, setListQuery] = useState("");
  const [listDateFrom, setListDateFrom] = useState("");
  const [listDateTo, setListDateTo] = useState("");
  const [listTimeFilter, setListTimeFilter] = useState<"all" | "future" | "past" | "today" | "week">("all");

  // טפסי יצירה/עריכה
  const editing = editingId === "new"
    ? null
    : assignments.find((a) => a.id === editingId) ?? null;

  const [vehicleId, setVehicleId] = useState("");
  const [missionDate, setMissionDate] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [chosenSoldiers, setChosenSoldiers] = useState<Soldier[]>([]);
  const [vehicleExpand, setVehicleExpand] = useState(false);
  const [soldierExpand, setSoldierExpand] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [soldierSearch, setSoldierSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shareOpenId, setShareOpenId] = useState<string | null>(null);
  const [showVehicleList, setShowVehicleList] = useState(false);
  const [showSoldierList, setShowSoldierList] = useState(false);
  const [wizardStep, setWizardStep] = useState<"vehicle" | "driver" | "commander" | "soldiers" | "confirm">("vehicle");
  const [driverSoldier, setDriverSoldier] = useState<Soldier | null>(null);
  const [commanderSoldier, setCommanderSoldier] = useState<Soldier | null>(null);
  const [companyFilter, setCompanyFilter] = useState("");

  const selectedVehicle = useMemo(() => vehicles.find((v) => v.id === vehicleId), [vehicles, vehicleId]);

  function soldierCanDrive(s: Soldier): boolean {
    if (!selectedVehicle || selectedVehicle.requiredLicenseIds.length === 0) return true;
    return selectedVehicle.requiredLicenseIds.some((lid) => s.licenseIds.includes(lid));
  }

  function openNew() {
    setEditingId("new");
    setVehicleId("");
    setMissionDate("");
    setDepartureTime("");
    setChosenSoldiers([]);
    setDriverSoldier(null);
    setCommanderSoldier(null);
    setShowVehicleList(true);
    setShowSoldierList(false);
    setWizardStep("vehicle");
    setCompanyFilter("");
    setSoldierSearch("");
    setError(null);
  }
  function loadFromTemplate(tplId: string) {
    const tpl = templates.find((t) => t.id === tplId);
    if (!tpl) return;
    setEditingId("new");
    setVehicleId(tpl.vehicleSerialUnitId);
    setMissionDate("");
    setDepartureTime("");
    const tplSoldiers = tpl.soldierIds.map((sid) => soldiers.find((s) => s.id === sid)).filter((s): s is Soldier => !!s);
    setDriverSoldier(tplSoldiers[0] ?? null);
    setCommanderSoldier(tplSoldiers[1] ?? null);
    setChosenSoldiers(tplSoldiers.slice(2));
    setShowVehicleList(false);
    setShowSoldierList(false);
    setWizardStep("confirm");
    setError(null);
  }

  function openEdit(a: Assignment) {
    setEditingId(a.id);
    setVehicleId(a.vehicleSerialUnitId);
    setMissionDate(a.missionDate);
    setDepartureTime(a.departureTime);
    const editSoldiers = a.soldiers.map((s) => {
      const full = soldiers.find((sol) => sol.id === s.id);
      return {
        id: s.id, fullName: s.fullName, personalNumber: s.personalNumber, phone: null,
        companyId: full?.companyId ?? null, companyName: s.companyName,
        licenseIds: full?.licenseIds ?? [],
      };
    });
    setDriverSoldier(editSoldiers[0] ?? null);
    setCommanderSoldier(editSoldiers[1] ?? null);
    setChosenSoldiers(editSoldiers.slice(2));
    setShowVehicleList(false);
    setShowSoldierList(false);
    setWizardStep("confirm");
    setError(null);
  }
  function cancelEdit() {
    setEditingId(null);
    setVehicleSearch(""); setSoldierSearch("");
    setVehicleExpand(false); setSoldierExpand(false);
    setShowVehicleList(false); setShowSoldierList(false);
  }

  useEscClose(!!editingId, cancelEdit);
  useEscClose(!!shareOpenId, () => setShareOpenId(null));

  // פילטור רכבים: כברירת מחדל - רק של הפלוגה שלי (אם יש holderId)
  const filteredVehicles = useMemo(() => {
    let list = vehicles;
    if (!vehicleExpand && myCompanyId) {
      list = list.filter((v) => v.holderId === myCompanyId);
    }
    if (vehicleSearch.trim()) {
      const s = vehicleSearch.toLowerCase();
      list = list.filter((v) => (v.itemName + " " + v.serialNumber + " " + (v.holderName ?? "")).toLowerCase().includes(s));
    }
    return list;
  }, [vehicles, vehicleExpand, myCompanyId, vehicleSearch]);

  // פילטור חיילים: כברירת מחדל - של הפלוגה שלי
  const filteredSoldiers = useMemo(() => {
    let list = soldiers;
    if (!soldierExpand && myCompanyId) {
      list = list.filter((s) => s.companyId === myCompanyId);
    }
    if (soldierSearch.trim()) {
      const q = soldierSearch.toLowerCase();
      list = list.filter((s) => (s.fullName + " " + (s.personalNumber ?? "") + " " + (s.companyName ?? "")).toLowerCase().includes(q));
    }
    // החיילים שכבר נוספו מסומנים
    return list;
  }, [soldiers, soldierExpand, myCompanyId, soldierSearch]);

  function toggleSoldier(s: Soldier) {
    setChosenSoldiers((cur) => {
      if (cur.some((c) => c.id === s.id)) return cur.filter((c) => c.id !== s.id);
      return [...cur, s];
    });
  }

  const allChosenSoldiers = useMemo(() => {
    const list: Soldier[] = [];
    if (driverSoldier) list.push(driverSoldier);
    if (commanderSoldier) list.push(commanderSoldier);
    list.push(...chosenSoldiers);
    return list;
  }, [driverSoldier, commanderSoldier, chosenSoldiers]);

  async function save() {
    setError(null);
    if (!vehicleId) { setError("בחר רכב"); return; }
    if (allChosenSoldiers.length === 0) { setError("הוסף לפחות חייל אחד"); return; }
    if (!missionDate) { setError("בחר תאריך משימה"); return; }
    if (!departureTime) { setError("בחר שעת יציאה"); return; }
    if (driverSoldier && !soldierCanDrive(driverSoldier)) {
      setError(`⛔ ${driverSoldier.fullName} (נהג) אין לו הרשאת נהיגה לרכב זה. יש לשנות נהג או רכב.`);
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      if (editingId && editingId !== "new") fd.append("id", editingId);
      fd.append("vehicleSerialUnitId", vehicleId);
      fd.append("missionDate", missionDate);
      fd.append("departureTime", departureTime);
      fd.append("soldierIds", JSON.stringify(allChosenSoldiers.map((s) => s.id)));
      const res = await saveAssignment(fd);
      if (res?.error) setError(res.error);
      else { cancelEdit(); router.refresh(); }
    } finally { setBusy(false); }
  }

  async function doDelete(id: string) {
    if (!confirm("למחוק את השיבוץ?")) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("id", id);
      const res = await deleteAssignment(fd);
      if (res?.error) alert(res.error);
      else router.refresh();
    } finally { setBusy(false); }
  }

  async function toggleComplete(id: string, currentlyCompleted: boolean) {
    const setCompleted = !currentlyCompleted;
    if (setCompleted && !confirm("לסמן את המשימה כהסתיימה?")) return;
    if (!setCompleted && !confirm("להחזיר לרשימת הפעילות?")) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("id", id);
      fd.append("completed", String(setCompleted));
      const res = await toggleAssignmentComplete(fd);
      if (res?.error) alert(res.error);
      else router.refresh();
    } finally { setBusy(false); }
  }

  function renderWizardSoldierPicker(onPick: (s: Soldier) => void, driverOnly: boolean, multi?: boolean) {
    const allAssigned = new Set([
      ...(driverSoldier ? [driverSoldier.id] : []),
      ...(commanderSoldier ? [commanderSoldier.id] : []),
      ...chosenSoldiers.map((s) => s.id),
    ]);
    let list = soldiers;
    if (!soldierExpand && myCompanyId) list = list.filter((s) => s.companyId === myCompanyId);
    if (companyFilter) list = list.filter((s) => s.companyId === companyFilter);
    if (soldierSearch.trim()) {
      const q = soldierSearch.toLowerCase();
      list = list.filter((s) => (s.fullName + " " + (s.personalNumber ?? "")).toLowerCase().includes(q));
    }
    return (
      <div className="border rounded-xl p-3 bg-slate-50">
        <div className="flex gap-2 mb-2 flex-wrap">
          <input value={soldierSearch} onChange={(e) => setSoldierSearch(e.target.value)} placeholder="🔍 שם / מ.א..." className="border rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[140px]" />
          {companies.length > 1 && (
            <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
              <option value="">כל הפלוגות</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {myCompanyId && (
            <button onClick={() => setSoldierExpand(!soldierExpand)}
              className={`text-[11px] rounded px-2 py-0.5 ${soldierExpand ? "bg-amber-100 text-amber-800 border border-amber-300" : "bg-slate-100 text-slate-600 border border-slate-200"}`}>
              {soldierExpand ? "🔓 כל הגדוד" : "🔒 הפלוגה שלי"}
            </button>
          )}
        </div>
        <div className="max-h-56 overflow-y-auto space-y-0.5">
          {list.map((s) => {
            const isAssigned = allAssigned.has(s.id);
            const hasLicense = soldierCanDrive(s);
            return (
              <div key={s.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm ${isAssigned ? "bg-blue-50 opacity-50" : "hover:bg-white cursor-pointer"} ${driverOnly && !hasLicense ? "opacity-60" : ""}`}
                onClick={() => {
                  if (isAssigned) return;
                  if (driverOnly && !hasLicense) { alert(`ל${s.fullName} אין הרשאת נהיגה מתאימה`); return; }
                  onPick(s);
                }}>
                <span className={isAssigned ? "line-through" : ""}>{s.fullName}</span>
                {s.personalNumber && <span className="text-[10px] text-slate-400 font-mono">{s.personalNumber}</span>}
                {s.companyName && <span className="text-[10px] text-slate-400">({s.companyName})</span>}
                {driverOnly && !hasLicense && <span className="text-[10px] text-rose-500">⚠️ אין הרשאה</span>}
                {driverOnly && hasLicense && <span className="text-[10px] text-green-600">🪪</span>}
                {isAssigned && <span className="text-[10px] text-blue-500 mr-auto">✓</span>}
              </div>
            );
          })}
          {list.length === 0 && <div className="text-xs text-slate-400 text-center py-3">אין חיילים מתאימים</div>}
        </div>
      </div>
    );
  }

  function buildWhatsAppText(a: Assignment): string {
    const dateStr = new Date(a.missionDate).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
    const vehicleLine = `רכב: ${a.vehicleName} ${a.vehicleSerial}` +
      (a.vehicleCompanyName ? ` (${a.vehicleCompanyName})` : "");
    const lines = [
      `🚗 שיבוץ רכב — ${dateStr} ${a.departureTime}`,
      vehicleLine,
      "",
      "חיילים:",
      ...a.soldiers.map((s) => {
        const parts: string[] = [];
        if (s.personalNumber) parts.push(s.personalNumber);
        if (s.companyName) parts.push(s.companyName);
        const suffix = parts.length > 0 ? ` (${parts.join(", ")})` : "";
        return `• ${s.fullName}${suffix}`;
      }),
    ];
    return lines.join("\n");
  }

  // 🆕 ספירות פעילים / הושלמו
  const counts = useMemo(() => ({
    active: assignments.filter((a) => !a.completedAt).length,
    completed: assignments.filter((a) => !!a.completedAt).length,
  }), [assignments]);

  // 🔍 סינון הרשימה - מתחיל מטאב נוכחי
  const filteredAssignments = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
    const base = assignments.filter((a) => tab === "completed" ? !!a.completedAt : !a.completedAt);
    return base.filter((a) => {
      // חיפוש טקסט חופשי - רכב/SN/חייל/מ.א./פלוגה
      if (listQuery.trim()) {
        const q = listQuery.toLowerCase();
        const hay = [
          a.vehicleName, a.vehicleSerial, a.vehicleCompanyName ?? "", a.companyName ?? "",
          a.createdByName,
          ...a.soldiers.flatMap((s) => [s.fullName, s.personalNumber ?? "", s.companyName ?? ""]),
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // טווח תאריכים
      if (listDateFrom && a.missionDate < listDateFrom) return false;
      if (listDateTo && a.missionDate > listDateTo) return false;
      // פילטר מהיר תזמון
      const d = new Date(a.missionDate);
      switch (listTimeFilter) {
        case "future": if (d < today) return false; break;
        case "past": if (d >= today) return false; break;
        case "today": if (d.toDateString() !== today.toDateString()) return false; break;
        case "week": if (d < today || d > weekEnd) return false; break;
      }
      return true;
    });
  }, [assignments, tab, listQuery, listDateFrom, listDateTo, listTimeFilter]);

  const hasFilter = !!(listQuery || listDateFrom || listDateTo || listTimeFilter !== "all");

  return (
    <>
      {/* כפתור יצירה + טאבים */}
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <a href="/dispatch/templates"
          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium">
          📋 שבצ&quot;ק קבוע
        </a>
        <button onClick={openNew}
          className="bg-blue-700 hover:bg-blue-800 text-white rounded-lg px-4 py-2 text-sm font-medium">
          + שבצ&quot;ק חדש
        </button>
        {templates.length > 0 && (
          <select
            value=""
            onChange={(e) => { if (e.target.value) loadFromTemplate(e.target.value); }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
          >
            <option value="">📋 טען משבצ&quot;ק קבוע...</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.vehicleName} - {t.vehicleSerial})</option>
            ))}
          </select>
        )}
        <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
          <button onClick={() => setTab("active")}
            className={`text-sm rounded-md px-3 py-1 transition ${
              tab === "active" ? "bg-white text-slate-900 shadow-sm font-medium" : "text-slate-600 hover:text-slate-900"
            }`}>
            📋 פעילות ({counts.active})
          </button>
          <button onClick={() => setTab("completed")}
            className={`text-sm rounded-md px-3 py-1 transition ${
              tab === "completed" ? "bg-white text-slate-900 shadow-sm font-medium" : "text-slate-600 hover:text-slate-900"
            }`}>
            ✓ הושלמו ({counts.completed})
          </button>
        </div>
      </div>

      {/* 🔍 פילטרים */}
      {assignments.length > 0 && (
        <Card className="p-3 mb-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
            <input value={listQuery} onChange={(e) => setListQuery(e.target.value)}
              placeholder="🔍 רכב / חייל / מ.א. / פלוגה"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            <div className="flex items-center gap-1">
              <label className="text-[11px] text-slate-500 whitespace-nowrap">מ-</label>
              <input type="date" value={listDateFrom} onChange={(e) => setListDateFrom(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-[11px] text-slate-500 whitespace-nowrap">עד-</label>
              <input type="date" value={listDateTo} onChange={(e) => setListDateTo(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
            {hasFilter && (
              <button onClick={() => { setListQuery(""); setListDateFrom(""); setListDateTo(""); setListTimeFilter("all"); }}
                className="rounded-lg border border-slate-300 text-sm hover:bg-slate-50">✕ נקה</button>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <FilterChip active={listTimeFilter === "all"} onClick={() => setListTimeFilter("all")}>הכל ({assignments.length})</FilterChip>
            <FilterChip active={listTimeFilter === "today"} onClick={() => setListTimeFilter("today")} color="emerald">📅 היום</FilterChip>
            <FilterChip active={listTimeFilter === "week"} onClick={() => setListTimeFilter("week")} color="blue">📆 השבוע</FilterChip>
            <FilterChip active={listTimeFilter === "future"} onClick={() => setListTimeFilter("future")} color="blue">⏭️ עתידי</FilterChip>
            <FilterChip active={listTimeFilter === "past"} onClick={() => setListTimeFilter("past")} color="slate">⏮️ עבר</FilterChip>
            <span className="text-xs text-slate-500 self-center mr-auto">
              {filteredAssignments.length} מתוך {assignments.length}
            </span>
          </div>
        </Card>
      )}

      {/* רשימת שיבוצים */}
      {assignments.length === 0 ? (
        <Card className="p-6">
          <EmptyState>
            <div className="text-center">
              <p>אין שיבוצים עדיין.</p>
              <p className="text-xs text-slate-500 mt-1">לחץ &quot;+ שבצ&quot;ק חדש&quot; כדי להתחיל</p>
            </div>
          </EmptyState>
        </Card>
      ) : filteredAssignments.length === 0 ? (
        <Card className="p-6">
          <EmptyState>
            <div className="text-center">
              <p>אין שיבוצים תואמים לסינון.</p>
              <p className="text-xs text-slate-500 mt-1">נסה לנקות פילטרים</p>
            </div>
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredAssignments.map((a) => {
            const dateStr = new Date(a.missionDate).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" });
            const dateObj = new Date(a.missionDate);
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const isPast = dateObj < today;
            const isCompleted = !!a.completedAt;
            const completedStr = a.completedAt
              ? new Date(a.completedAt).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
                " " + new Date(a.completedAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
              : null;
            return (
              <Card key={a.id} className={`overflow-hidden ${isCompleted ? "bg-emerald-50/30" : isPast ? "opacity-60" : ""}`}>
                <div className="p-3 flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-44">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg">🚗</span>
                      <span className="font-bold text-slate-800">{a.vehicleName}</span>
                      <span className="font-mono text-xs bg-slate-100 rounded px-1.5 py-0.5">{a.vehicleSerial}</span>
                      {a.companyName && <Badge className="bg-indigo-100 text-indigo-700">{a.companyName}</Badge>}
                      {isCompleted && <Badge className="bg-emerald-100 text-emerald-700">✓ הסתיימה</Badge>}
                      {!isCompleted && isPast && <Badge className="bg-amber-100 text-amber-700">⚠️ לא נסגר</Badge>}
                    </div>
                    <div className="text-xs text-slate-600 mt-1 flex gap-3 flex-wrap">
                      <span>📅 <b>{dateStr}</b></span>
                      <span>⏰ <b>{a.departureTime}</b></span>
                      <span>👥 <b>{a.soldiers.length}</b> חיילים</span>
                      <span className="text-slate-400">· יצר: {a.createdByName}</span>
                      {completedStr && <span className="text-emerald-700">· הסתיים: {completedStr}</span>}
                    </div>
                    <div className="text-xs text-slate-700 mt-1.5 flex gap-1 flex-wrap">
                      {a.soldiers.map((s) => (
                        <span key={s.id} className="bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                          {s.fullName}{s.personalNumber && <span className="text-slate-400 mr-1">{s.personalNumber}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {!isCompleted && (
                      <button onClick={() => toggleComplete(a.id, false)} disabled={busy}
                        className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded px-2.5 py-1.5 disabled:opacity-50">
                        ✓ הסתיימה
                      </button>
                    )}
                    {isCompleted && (
                      <button onClick={() => toggleComplete(a.id, true)} disabled={busy}
                        className="text-xs bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 rounded px-2.5 py-1.5">
                        ↩ החזר לפעילות
                      </button>
                    )}
                    <button onClick={() => setShareOpenId(a.id)}
                      className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded px-2.5 py-1.5">
                      💬 שלח
                    </button>
                    <button onClick={() => openEdit(a)}
                      className="text-xs bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded px-2.5 py-1.5">
                      ✎ ערוך
                    </button>
                    <button onClick={() => doDelete(a.id)} disabled={busy}
                      className="text-xs bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded px-2.5 py-1.5">
                      🗑️
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* מודל יצירה/עריכה — wizard */}
      {editingId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-4" onClick={cancelEdit}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white p-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-lg">🚗 {editing ? 'עריכת שבצ"ק' : 'שבצ"ק חדש'}</h3>
                <p className="text-xs text-blue-100 mt-0.5">{battalionName}</p>
              </div>
              <button onClick={cancelEdit} className="text-blue-100 hover:text-white text-2xl">✕</button>
            </div>

            {/* Date/time always visible */}
            <div className="px-4 pt-3 pb-2 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1">📅 תאריך <span className="text-rose-600">*</span></label>
                  <input type="date" value={missionDate} onChange={(e) => setMissionDate(e.target.value)} required
                    className={`w-full rounded-lg border-2 px-3 py-2 text-sm ${missionDate ? "border-emerald-300 bg-emerald-50" : "border-rose-300 bg-rose-50"}`} />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1">⏰ שעת יציאה <span className="text-rose-600">*</span></label>
                  <input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} required
                    className={`w-full rounded-lg border-2 px-3 py-2 text-sm ${departureTime ? "border-emerald-300 bg-emerald-50" : "border-rose-300 bg-rose-50"}`} />
                </div>
              </div>
            </div>

            {/* Wizard step indicators */}
            <div className="flex gap-1 px-4 pt-2 pb-1 border-b border-slate-200 shrink-0">
              {([
                { key: "vehicle" as const, label: "רכב", icon: "🚗", done: !!vehicleId },
                { key: "driver" as const, label: "נהג", icon: "🔑", done: !!driverSoldier },
                { key: "commander" as const, label: "מפקד", icon: "⭐", done: !!commanderSoldier },
                { key: "soldiers" as const, label: "חיילים", icon: "🎖️", done: chosenSoldiers.length > 0 },
                { key: "confirm" as const, label: "אישור", icon: "✅", done: false },
              ]).map((s, i) => (
                <button key={s.key} onClick={() => setWizardStep(s.key)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-t-lg text-xs font-medium transition ${
                    wizardStep === s.key ? "bg-blue-100 text-blue-800 border-b-2 border-blue-600" : s.done ? "text-emerald-600" : "text-slate-400 hover:text-slate-600"
                  }`}>
                  <span>{s.done && wizardStep !== s.key ? "✅" : s.icon}</span>
                  <span>{s.label}</span>
                  {i < 4 && <span className="text-slate-300 mr-1">›</span>}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Step: Vehicle */}
              {wizardStep === "vehicle" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium text-sm">🚗 בחר רכב</h4>
                    {myCompanyId && (
                      <button onClick={() => setVehicleExpand(!vehicleExpand)}
                        className={`text-[11px] rounded px-2 py-0.5 ${vehicleExpand ? "bg-amber-100 text-amber-800 border border-amber-300" : "bg-slate-100 text-slate-600 border border-slate-200"}`}>
                        {vehicleExpand ? "🔓 כל הגדוד" : "🔒 רק הפלוגה שלי"}
                      </button>
                    )}
                  </div>
                  {vehicleId && (() => {
                    const v = vehicles.find((x) => x.id === vehicleId);
                    return v ? (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 flex items-center gap-2 text-sm">
                        <span>🚗</span><span className="font-bold">{v.itemName} {v.serialNumber}</span>
                        <button onClick={() => setVehicleId("")} className="text-rose-400 hover:text-rose-600 mr-auto">✕</button>
                      </div>
                    ) : null;
                  })()}
                  <input value={vehicleSearch} onChange={(e) => setVehicleSearch(e.target.value)}
                    placeholder="🔍 חיפוש רכב..." className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {filteredVehicles.map((v) => (
                      <button key={v.id} onClick={() => { setVehicleId(v.id); setWizardStep("driver"); }}
                        className={`w-full text-right p-2 rounded-lg border flex items-center gap-2 text-sm ${vehicleId === v.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
                        <span className="text-lg">🚗</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{v.itemName} <span className="font-mono text-xs text-slate-500">{v.serialNumber}</span></div>
                          <div className="text-xs text-slate-500">{v.holderName ?? "—"}{v.statusName && <span className={`mr-2 ${v.isLoss ? "text-rose-600" : v.isWear ? "text-amber-600" : "text-emerald-600"}`}>· {v.statusName}</span>}</div>
                        </div>
                        {vehicleId === v.id && <span className="text-blue-600 text-lg">✓</span>}
                      </button>
                    ))}
                    {filteredVehicles.length === 0 && <div className="text-xs text-slate-400 text-center py-3 bg-slate-50 rounded-lg">אין רכבים מתאימים</div>}
                  </div>
                  <div className="flex justify-end">
                    <button onClick={() => setWizardStep("driver")} disabled={!vehicleId}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                      המשך לנהג ›
                    </button>
                  </div>
                </div>
              )}

              {/* Step: Driver */}
              {wizardStep === "driver" && (
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">🔑 בחר נהג</h4>
                  {driverSoldier && (
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 text-sm">
                      <span className="font-bold">{driverSoldier.fullName}</span>
                      <button onClick={() => setDriverSoldier(null)} className="text-rose-400 hover:text-rose-600">✕</button>
                    </div>
                  )}
                  {!driverSoldier && <p className="text-xs text-slate-500">בחר חייל עם הרשאת נהיגה מתאימה לרכב</p>}
                  {renderWizardSoldierPicker((s) => {
                    setDriverSoldier(s);
                    setWizardStep("commander");
                  }, true)}
                  <div className="flex justify-between">
                    <button onClick={() => setWizardStep("vehicle")} className="px-4 py-2 bg-slate-200 rounded-lg text-sm">‹ חזרה</button>
                    <button onClick={() => setWizardStep("commander")} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                      {driverSoldier ? "המשך למפקד ›" : "דלג ›"}
                    </button>
                  </div>
                </div>
              )}

              {/* Step: Commander */}
              {wizardStep === "commander" && (
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">⭐ בחר מפקד</h4>
                  {commanderSoldier && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-sm">
                      <span className="font-bold">{commanderSoldier.fullName}</span>
                      <button onClick={() => setCommanderSoldier(null)} className="text-rose-400 hover:text-rose-600">✕</button>
                    </div>
                  )}
                  {renderWizardSoldierPicker((s) => {
                    setCommanderSoldier(s);
                    setWizardStep("soldiers");
                  }, false)}
                  <div className="flex justify-between">
                    <button onClick={() => setWizardStep("driver")} className="px-4 py-2 bg-slate-200 rounded-lg text-sm">‹ חזרה</button>
                    <button onClick={() => setWizardStep("soldiers")} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                      {commanderSoldier ? "המשך לחיילים ›" : "דלג ›"}
                    </button>
                  </div>
                </div>
              )}

              {/* Step: Soldiers */}
              {wizardStep === "soldiers" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <h4 className="font-medium text-sm">🎖️ הוסף חיילים</h4>
                    <span className="text-xs text-slate-400">({chosenSoldiers.length} משובצים)</span>
                  </div>
                  {chosenSoldiers.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {chosenSoldiers.map((s) => (
                        <span key={s.id} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs border bg-slate-100 text-slate-700 border-slate-300">
                          🎖️ <span className="font-medium">{s.fullName}</span>
                          <button onClick={() => setChosenSoldiers((prev) => prev.filter((p) => p.id !== s.id))} className="text-rose-400 hover:text-rose-600">✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                  {renderWizardSoldierPicker((s) => {
                    if (!chosenSoldiers.some((c) => c.id === s.id)) {
                      setChosenSoldiers((prev) => [...prev, s]);
                    }
                  }, false, true)}
                  <div className="flex justify-between">
                    <button onClick={() => setWizardStep("commander")} className="px-4 py-2 bg-slate-200 rounded-lg text-sm">‹ חזרה</button>
                    <button onClick={() => setWizardStep("confirm")} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">סיכום ואישור ›</button>
                  </div>
                </div>
              )}

              {/* Step: Confirm */}
              {wizardStep === "confirm" && (
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">סיכום שיבוץ</h4>
                  {(() => {
                    const v = vehicles.find((x) => x.id === vehicleId);
                    if (!v) return <div className="text-sm text-rose-600">⚠️ לא נבחר רכב</div>;
                    return (
                      <div className="bg-slate-800 text-white rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-3xl">🚗</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-lg">{v.itemName}</div>
                            <div className="text-sm text-slate-300 font-mono">{v.serialNumber} {v.holderName ? `· ${v.holderName}` : ""}</div>
                          </div>
                          <button onClick={() => setWizardStep("vehicle")} className="text-xs bg-slate-700 hover:bg-slate-600 rounded-lg px-3 py-1.5 text-slate-200">🔄 החלף</button>
                        </div>
                        {driverSoldier && !soldierCanDrive(driverSoldier) && (
                          <div className="bg-rose-900/60 border border-rose-500 rounded-lg p-2 mb-2 text-xs text-rose-200">
                            ⛔ <b>{driverSoldier.fullName}</b> (נהג) — אין הרשאת נהיגה לרכב זה!
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <div className={`rounded-lg p-2 flex items-center gap-2 ${driverSoldier ? "bg-blue-900/50" : "border border-dashed border-blue-400"}`}>
                            <span>🔑</span>
                            {driverSoldier ? (
                              <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{driverSoldier.fullName}</div><div className="text-[11px] text-slate-400">נהג</div></div>
                            ) : <span className="text-xs text-blue-300">נהג (חסר)</span>}
                            {driverSoldier && <button onClick={() => { setDriverSoldier(null); setWizardStep("driver"); }} className="text-slate-500 hover:text-rose-400 text-sm">✕</button>}
                          </div>
                          <div className={`rounded-lg p-2 flex items-center gap-2 ${commanderSoldier ? "bg-amber-900/50" : "border border-dashed border-slate-400"}`}>
                            <span>⭐</span>
                            {commanderSoldier ? (
                              <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{commanderSoldier.fullName}</div><div className="text-[11px] text-slate-400">מפקד</div></div>
                            ) : <span className="text-xs text-slate-400">מפקד (חסר)</span>}
                            {commanderSoldier && <button onClick={() => { setCommanderSoldier(null); setWizardStep("commander"); }} className="text-slate-500 hover:text-rose-400 text-sm">✕</button>}
                          </div>
                          {chosenSoldiers.map((s) => (
                            <div key={s.id} className="bg-slate-700 rounded-lg p-2 flex items-center gap-2">
                              <span>🎖️</span>
                              <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{s.fullName}</div><div className="text-[11px] text-slate-400">לוחם{s.companyName ? ` · ${s.companyName}` : ""}</div></div>
                              <button onClick={() => setChosenSoldiers((prev) => prev.filter((p) => p.id !== s.id))} className="text-slate-500 hover:text-rose-400 text-sm">✕</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {!driverSoldier && <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">⚠️ לא נבחר נהג</div>}
                  {!commanderSoldier && <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">⚠️ לא נבחר מפקד</div>}
                  {error && <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-2 text-sm">⚠️ {error}</div>}
                  <div className="flex justify-between pt-2 border-t border-slate-200">
                    <button onClick={() => setWizardStep("soldiers")} className="px-4 py-2 bg-slate-200 rounded-lg text-sm">‹ חזרה</button>
                    <button onClick={save} disabled={busy || !vehicleId || allChosenSoldiers.length === 0 || !missionDate || !departureTime}
                      className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 shadow-md">
                      {busy ? "שומר..." : editing ? "💾 עדכן" : "💾 צור שיבוץ"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* מודל שיתוף WhatsApp */}
      {shareOpenId && (() => {
        const a = assignments.find((x) => x.id === shareOpenId);
        if (!a) return null;
        const text = buildWhatsAppText(a);
        const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-4" onClick={() => setShareOpenId(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="bg-emerald-700 text-white p-4 flex items-center justify-between">
                <h3 className="font-bold text-lg">💬 שלח ב-WhatsApp</h3>
                <button onClick={() => setShareOpenId(null)} className="text-white text-2xl">✕</button>
              </div>
              <div className="p-4 space-y-3">
                <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm whitespace-pre-wrap font-sans">{text}</pre>
                <a href={waUrl} target="_blank" rel="noopener noreferrer"
                  className="block w-full text-center bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2.5 text-sm font-bold">
                  📲 פתח ב-WhatsApp
                </a>
                <button onClick={() => { navigator.clipboard.writeText(text); }}
                  className="block w-full text-center rounded-lg border border-slate-300 px-4 py-2 text-sm">
                  📋 העתק טקסט
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}

function FilterChip({
  children, active, onClick, color = "slate",
}: { children: React.ReactNode; active: boolean; onClick: () => void; color?: "slate" | "emerald" | "blue" }) {
  const colorMap = {
    slate: active ? "bg-slate-800 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700",
    emerald: active ? "bg-emerald-700 text-white" : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200",
    blue: active ? "bg-blue-700 text-white" : "bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200",
  };
  return (
    <button onClick={onClick} className={`text-xs rounded-full px-3 py-1 transition ${colorMap[color]}`}>
      {children}
    </button>
  );
}
