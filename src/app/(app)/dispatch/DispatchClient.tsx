"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, EmptyState } from "@/components/ui";
import { useEscClose } from "@/lib/useEscClose";
import { saveAssignment, deleteAssignment, toggleAssignmentComplete } from "./actions";

type Vehicle = {
  id: string; itemName: string; serialNumber: string;
  statusName: string; isWear: boolean; isLoss: boolean;
  holderId: string | null; holderName: string | null; holderKind: string | null;
};
type Soldier = {
  id: string; fullName: string; personalNumber: string | null; phone: string | null;
  companyId: string | null; companyName: string | null;
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

export default function DispatchClient({
  battalionName, myCompanyId, templates = [], vehicles, soldiers, assignments,
}: {
  battalionName: string;
  myCompanyId: string | null;
  templates?: DispatchTpl[];
  vehicles: Vehicle[];
  soldiers: Soldier[];
  assignments: Assignment[];
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

  function openNew() {
    setEditingId("new");
    setVehicleId("");
    setMissionDate("");
    setDepartureTime("");
    setChosenSoldiers([]);
    setError(null);
  }
  function loadFromTemplate(tplId: string) {
    const tpl = templates.find((t) => t.id === tplId);
    if (!tpl) return;
    setEditingId("new");
    setVehicleId(tpl.vehicleSerialUnitId);
    setMissionDate("");
    setDepartureTime("");
    setChosenSoldiers(
      tpl.soldierIds
        .map((sid) => soldiers.find((s) => s.id === sid))
        .filter((s): s is Soldier => !!s)
    );
    setError(null);
  }

  function openEdit(a: Assignment) {
    setEditingId(a.id);
    setVehicleId(a.vehicleSerialUnitId);
    setMissionDate(a.missionDate);
    setDepartureTime(a.departureTime);
    setChosenSoldiers(a.soldiers.map((s) => ({
      id: s.id, fullName: s.fullName, personalNumber: s.personalNumber, phone: null,
      companyId: null, companyName: s.companyName,
    })));
    setError(null);
  }
  function cancelEdit() {
    setEditingId(null);
    setVehicleSearch(""); setSoldierSearch("");
    setVehicleExpand(false); setSoldierExpand(false);
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

  async function save() {
    setError(null);
    if (!vehicleId) { setError("בחר רכב"); return; }
    if (chosenSoldiers.length === 0) { setError("הוסף לפחות חייל אחד"); return; }
    if (!missionDate) { setError("בחר תאריך משימה"); return; }
    if (!departureTime) { setError("בחר שעת יציאה"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      if (editingId && editingId !== "new") fd.append("id", editingId);
      fd.append("vehicleSerialUnitId", vehicleId);
      fd.append("missionDate", missionDate);
      fd.append("departureTime", departureTime);
      fd.append("soldierIds", JSON.stringify(chosenSoldiers.map((s) => s.id)));
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
        <button onClick={openNew}
          className="bg-blue-700 hover:bg-blue-800 text-white rounded-lg px-4 py-2 text-sm font-medium">
          + שיבוץ חדש
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
        <a href="/dispatch/templates" className="text-xs text-blue-600 hover:underline self-center">שבצ&quot;ק קבוע →</a>
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
              <p className="text-xs text-slate-500 mt-1">לחץ &quot;+ שיבוץ חדש&quot; כדי להתחיל</p>
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

      {/* מודל יצירה/עריכה */}
      {editingId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-4" onClick={cancelEdit}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white p-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-lg">🚗 {editing ? "עריכת שיבוץ" : "שיבוץ חדש"}</h3>
                <p className="text-xs text-blue-100 mt-0.5">{battalionName}</p>
              </div>
              <button onClick={cancelEdit} className="text-blue-100 hover:text-white text-2xl">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* 1. תאריך + שעה — למעלה כדי שתמיד ייראו */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1">
                    📅 תאריך משימה <span className="text-rose-600">*</span>
                  </label>
                  <input type="date" value={missionDate} onChange={(e) => setMissionDate(e.target.value)}
                    required
                    className={`w-full rounded-lg border-2 px-3 py-2 text-sm ${
                      missionDate ? "border-emerald-300 bg-emerald-50" : "border-rose-300 bg-rose-50"
                    }`} />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1">
                    ⏰ שעת יציאה <span className="text-rose-600">*</span>
                  </label>
                  <input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)}
                    required
                    className={`w-full rounded-lg border-2 px-3 py-2 text-sm ${
                      departureTime ? "border-emerald-300 bg-emerald-50" : "border-rose-300 bg-rose-50"
                    }`} />
                </div>
              </div>

              {/* סיכום ויזואלי של הרכב — כשנטען מתבנית או כשנבחר רכב+חיילים */}
              {vehicleId && chosenSoldiers.length > 0 && (() => {
                const v = vehicles.find((x) => x.id === vehicleId);
                if (!v) return null;
                return (
                  <div className="bg-slate-800 text-white rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-3xl">🚗</span>
                      <div>
                        <div className="font-bold text-lg">{v.itemName}</div>
                        <div className="text-sm text-slate-300 font-mono">{v.serialNumber} {v.holderName ? `· ${v.holderName}` : ""}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {chosenSoldiers.map((s, i) => (
                        <div key={s.id} className="bg-slate-700 rounded-lg p-2 flex items-center gap-2">
                          <span className="text-lg">{i === 0 ? "🚗" : "🪖"}</span>
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{s.fullName}</div>
                            <div className="text-[11px] text-slate-400">{i === 0 ? "נהג" : `מושב ${i + 1}`}{s.companyName ? ` · ${s.companyName}` : ""}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* 2. רכב */}
              <div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <label className="text-sm font-semibold text-slate-700">🚗 רכב {vehicleId && "✓"}</label>
                  {myCompanyId && (
                    <button onClick={() => setVehicleExpand(!vehicleExpand)}
                      className={`text-[11px] rounded px-2 py-0.5 ${vehicleExpand ? "bg-amber-100 text-amber-800 border border-amber-300" : "bg-slate-100 text-slate-600 border border-slate-200"}`}>
                      {vehicleExpand ? "🔓 כל הגדוד" : "🔒 רק הפלוגה שלי"}
                    </button>
                  )}
                </div>
                <input value={vehicleSearch} onChange={(e) => setVehicleSearch(e.target.value)}
                  placeholder="🔍 חיפוש רכב..." className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm mb-2" />
                {filteredVehicles.length === 0 ? (
                  <div className="text-xs text-slate-400 text-center py-3 bg-slate-50 rounded-lg">
                    אין רכבים מתאימים
                    {!vehicleExpand && myCompanyId && <span> · נסה לפתוח לכלל הגדוד</span>}
                  </div>
                ) : (
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {filteredVehicles.map((v) => (
                      <button key={v.id} onClick={() => setVehicleId(v.id)}
                        className={`w-full text-right p-2 rounded-lg border flex items-center gap-2 text-sm ${
                          vehicleId === v.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
                        }`}>
                        <span className="text-lg">🚗</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{v.itemName} <span className="font-mono text-xs text-slate-500">{v.serialNumber}</span></div>
                          <div className="text-xs text-slate-500">
                            {v.holderName ?? "—"}
                            {v.statusName && <span className={`mr-2 ${v.isLoss ? "text-rose-600" : v.isWear ? "text-amber-600" : "text-emerald-600"}`}>· {v.statusName}</span>}
                          </div>
                        </div>
                        {vehicleId === v.id && <span className="text-blue-600 text-lg">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. חיילים */}
              <div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <label className="text-sm font-semibold text-slate-700">🪖 חיילים ({chosenSoldiers.length})</label>
                  {myCompanyId && (
                    <button onClick={() => setSoldierExpand(!soldierExpand)}
                      className={`text-[11px] rounded px-2 py-0.5 ${soldierExpand ? "bg-amber-100 text-amber-800 border border-amber-300" : "bg-slate-100 text-slate-600 border border-slate-200"}`}>
                      {soldierExpand ? "🔓 כל הגדוד" : "🔒 רק הפלוגה שלי"}
                    </button>
                  )}
                </div>
                {chosenSoldiers.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {chosenSoldiers.map((s) => (
                      <span key={s.id} className="bg-blue-100 text-blue-800 border border-blue-300 rounded-full px-2 py-0.5 text-xs flex items-center gap-1">
                        {s.fullName}{s.personalNumber && <span className="text-blue-500">{s.personalNumber}</span>}
                        <button onClick={() => toggleSoldier(s)} className="hover:text-rose-600 text-sm leading-none">✕</button>
                      </span>
                    ))}
                  </div>
                )}
                <input value={soldierSearch} onChange={(e) => setSoldierSearch(e.target.value)}
                  placeholder="🔍 חיפוש חייל..." className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm mb-2" />
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {filteredSoldiers.map((s) => {
                    const chosen = chosenSoldiers.some((c) => c.id === s.id);
                    return (
                      <button key={s.id} onClick={() => toggleSoldier(s)}
                        className={`w-full text-right p-2 rounded-lg border flex items-center gap-2 text-sm ${
                          chosen ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
                        }`}>
                        <span className="text-lg">🪖</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{s.fullName} {s.personalNumber && <span className="font-mono text-xs text-slate-500">{s.personalNumber}</span>}</div>
                          {s.companyName && <div className="text-xs text-slate-500">{s.companyName}</div>}
                        </div>
                        {chosen && <span className="text-blue-600 text-lg">✓</span>}
                      </button>
                    );
                  })}
                  {filteredSoldiers.length === 0 && (
                    <div className="text-xs text-slate-400 text-center py-3 bg-slate-50 rounded-lg">אין חיילים מתאימים</div>
                  )}
                </div>
              </div>

              {error && <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-2 text-sm">⚠️ {error}</div>}
            </div>

            <div className="border-t border-slate-200 p-3 flex gap-2 shrink-0 bg-slate-50">
              <button onClick={cancelEdit} disabled={busy}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
              <button onClick={save} disabled={busy}
                className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-bold">
                {busy ? "שומר..." : editing ? "💾 עדכן" : "💾 צור שיבוץ"}
              </button>
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
