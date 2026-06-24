"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { addForce, removeForce, saveDayEntry } from "../actions";

type SoldierRef = { id: string; name: string; company?: string | null };
type DayEntryData = {
  id: string;
  plannedTasks: string | null;
  actualTasks: string | null;
  plannedNotes: string | null;
  actualNotes: string | null;
  plannedSoldiers: SoldierRef[];
  actualSoldiers: SoldierRef[];
};
type Force = {
  id: string;
  userId: string;
  userName: string;
  userTitle: string | null;
  forceName: string;
  dayEntries: Record<string, DayEntryData>;
};
type SoldierOption = {
  id: string;
  fullName: string;
  personalNumber: string | null;
  companyId: string | null;
  companyName: string | null;
};

export default function EventClient({
  eventId, eventName, eventType, startDate, endDate, notes,
  createdById, currentUserId, isAdmin, dates, forces: initialForces,
  allUsers, soldiers, companies,
}: {
  eventId: string;
  eventName: string;
  eventType: string;
  startDate: string;
  endDate: string;
  notes: string | null;
  createdById: string;
  currentUserId: string;
  isAdmin: boolean;
  dates: string[];
  forces: Force[];
  allUsers: { id: string; fullName: string; title: string | null }[];
  soldiers: SoldierOption[];
  companies: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showAddForce, setShowAddForce] = useState(false);
  const [editingCell, setEditingCell] = useState<{ forceId: string; date: string } | null>(null);
  const canManage = isAdmin || createdById === currentUserId;

  const fmtDay = (d: string) => {
    const dt = new Date(d + "T00:00:00");
    const dayNames = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
    return { day: dayNames[dt.getDay()], date: `${dt.getDate()}/${dt.getMonth() + 1}` };
  };

  async function handleAddForce(fd: FormData) {
    fd.set("eventId", eventId);
    startTransition(async () => {
      const res = await addForce(fd);
      if (res.ok) {
        setShowAddForce(false);
        router.refresh();
      }
    });
  }

  async function handleRemoveForce(forceId: string) {
    if (!confirm("להסיר את הכח מהאירוע?")) return;
    const fd = new FormData();
    fd.set("forceId", forceId);
    startTransition(async () => {
      await removeForce(fd);
      router.refresh();
    });
  }

  const editingForce = editingCell ? initialForces.find((f) => f.id === editingCell.forceId) : null;
  const editingEntry = editingForce && editingCell ? editingForce.dayEntries[editingCell.date] : null;
  const canEditForce = (force: Force) => isAdmin || createdById === currentUserId || force.userId === currentUserId;

  return (
    <div className="space-y-4">
      {/* Forces management */}
      {canManage && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm text-slate-700">👥 כוחות מוזמנים</h3>
            <button onClick={() => setShowAddForce(!showAddForce)} className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700">
              {showAddForce ? "ביטול" : "+ הזמן כח"}
            </button>
          </div>

          {showAddForce && (
            <form action={handleAddForce} className="flex flex-wrap items-end gap-3 mb-3 p-3 bg-slate-50 rounded-lg">
              <div>
                <label className="block text-xs text-slate-500 mb-1">משתמש</label>
                <select name="userId" required className="border rounded-lg px-3 py-2 text-sm">
                  <option value="">בחר משתמש</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.fullName}{u.title ? ` (${u.title})` : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">שם הכח</label>
                <input name="forceName" required className="border rounded-lg px-3 py-2 text-sm w-48" placeholder="למשל: צוות רחפנים" />
              </div>
              <button disabled={pending} className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-emerald-700 disabled:opacity-50">
                הוסף
              </button>
            </form>
          )}

          {initialForces.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {initialForces.map((f) => (
                <div key={f.id} className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                  <span className="text-sm font-bold text-blue-800">{f.forceName}</span>
                  <span className="text-xs text-blue-600">({f.userName})</span>
                  {canManage && (
                    <button onClick={() => handleRemoveForce(f.id)} className="text-xs text-rose-400 hover:text-rose-600">✕</button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">אין כוחות מוזמנים — הוסף כח כדי להתחיל</p>
          )}
        </Card>
      )}

      {/* Schedule grid */}
      {initialForces.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="py-2 px-3 text-right font-bold border-l border-slate-700 sticky right-0 bg-slate-800 z-10 min-w-[120px]">כח</th>
                  {dates.map((d) => {
                    const { day, date } = fmtDay(d);
                    const isToday = d === new Date().toISOString().slice(0, 10);
                    return (
                      <th key={d} className={`py-2 px-2 text-center border-l border-slate-700 min-w-[100px] ${isToday ? "bg-blue-900" : ""}`}>
                        <div className="text-[10px] text-slate-300">{day}</div>
                        <div>{date}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {initialForces.map((force) => (
                  <tr key={force.id} className="border-t border-slate-200 hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-slate-700 border-l border-slate-200 sticky right-0 bg-white z-10">
                      <div>{force.forceName}</div>
                      <div className="text-[10px] text-slate-400 font-normal">{force.userName}</div>
                    </td>
                    {dates.map((d) => {
                      const entry = force.dayEntries[d];
                      const plannedCount = entry?.plannedSoldiers?.length ?? 0;
                      const actualCount = entry?.actualSoldiers?.length ?? 0;
                      const hasTasks = !!(entry?.plannedTasks || entry?.actualTasks);
                      const isEmpty = !entry || (plannedCount === 0 && actualCount === 0 && !hasTasks);
                      const isToday = d === new Date().toISOString().slice(0, 10);
                      const editable = canEditForce(force);

                      return (
                        <td
                          key={d}
                          onClick={() => editable && setEditingCell({ forceId: force.id, date: d })}
                          className={`py-1.5 px-2 border-l border-slate-200 text-center transition-colors ${
                            editable ? "cursor-pointer hover:bg-blue-50" : ""
                          } ${isToday ? "bg-blue-50/50" : ""} ${
                            isEmpty ? "" : actualCount > 0 ? "bg-emerald-50" : "bg-amber-50"
                          }`}
                        >
                          {!isEmpty && (
                            <div className="space-y-0.5">
                              {plannedCount > 0 && (
                                <div className="text-[10px] text-amber-700">📋 {plannedCount}</div>
                              )}
                              {actualCount > 0 && (
                                <div className="text-[10px] text-emerald-700">✅ {actualCount}</div>
                              )}
                              {hasTasks && (
                                <div className="text-[10px] text-slate-500">📝</div>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Legend */}
      {initialForces.length > 0 && (
        <div className="flex gap-4 text-[10px] text-slate-500 px-1">
          <span>📋 = תכנון</span>
          <span>✅ = ביצוע</span>
          <span>📝 = משימות</span>
          <span className="text-slate-400">לחץ על תא לעריכה</span>
        </div>
      )}

      {/* Day entry editor modal */}
      {editingCell && editingForce && (
        <DayEntryEditor
          eventId={eventId}
          forceId={editingCell.forceId}
          forceName={editingForce.forceName}
          date={editingCell.date}
          entry={editingEntry ?? null}
          soldiers={soldiers}
          companies={companies}
          onClose={() => setEditingCell(null)}
        />
      )}
    </div>
  );
}

// ========== Day Entry Editor ==========
function DayEntryEditor({
  eventId, forceId, forceName, date, entry, soldiers, companies, onClose,
}: {
  eventId: string;
  forceId: string;
  forceName: string;
  date: string;
  entry: DayEntryData | null;
  soldiers: SoldierOption[];
  companies: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [plannedTasks, setPlannedTasks] = useState(entry?.plannedTasks ?? "");
  const [actualTasks, setActualTasks] = useState(entry?.actualTasks ?? "");
  const [plannedNotes, setPlannedNotes] = useState(entry?.plannedNotes ?? "");
  const [actualNotes, setActualNotes] = useState(entry?.actualNotes ?? "");
  const [plannedIds, setPlannedIds] = useState<string[]>(entry?.plannedSoldiers?.map((s) => s.id) ?? []);
  const [actualIds, setActualIds] = useState<string[]>(entry?.actualSoldiers?.map((s) => s.id) ?? []);
  const [activeTab, setActiveTab] = useState<"planned" | "actual">("planned");
  const [filterCompany, setFilterCompany] = useState("");
  const [search, setSearch] = useState("");

  const fmtDate = new Date(date + "T00:00:00").toLocaleDateString("he-IL", { weekday: "short", day: "numeric", month: "long" });

  const filteredSoldiers = soldiers.filter((s) => {
    if (filterCompany && s.companyId !== filterCompany) return false;
    if (search && !s.fullName.includes(search) && !(s.personalNumber || "").includes(search)) return false;
    return true;
  });

  const currentIds = activeTab === "planned" ? plannedIds : actualIds;
  const setCurrentIds = activeTab === "planned" ? setPlannedIds : setActualIds;

  function toggleSoldier(id: string) {
    setCurrentIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function handleSave() {
    const fd = new FormData();
    fd.set("forceId", forceId);
    fd.set("eventId", eventId);
    fd.set("date", date);
    fd.set("plannedTasks", plannedTasks);
    fd.set("actualTasks", actualTasks);
    fd.set("plannedNotes", plannedNotes);
    fd.set("actualNotes", actualNotes);
    fd.set("plannedSoldierIds", JSON.stringify(plannedIds));
    fd.set("actualSoldierIds", JSON.stringify(actualIds));

    startTransition(async () => {
      const res = await saveDayEntry(fd);
      if (res.ok) {
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-slate-800 text-white p-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold">{forceName}</h2>
            <div className="text-sm text-slate-300">{fmtDate}</div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-white text-xl">✕</button>
        </div>

        {/* Plan/Actual tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab("planned")}
            className={`flex-1 py-2.5 text-sm font-bold text-center ${activeTab === "planned" ? "bg-amber-50 text-amber-700 border-b-2 border-amber-500" : "text-slate-500 hover:text-slate-800"}`}
          >
            📋 תכנון ({plannedIds.length})
          </button>
          <button
            onClick={() => setActiveTab("actual")}
            className={`flex-1 py-2.5 text-sm font-bold text-center ${activeTab === "actual" ? "bg-emerald-50 text-emerald-700 border-b-2 border-emerald-500" : "text-slate-500 hover:text-slate-800"}`}
          >
            ✅ ביצוע ({actualIds.length})
          </button>
        </div>

        <div className="overflow-y-auto max-h-[60vh] p-4 space-y-4">
          {/* Tasks */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              {activeTab === "planned" ? "משימות מתוכננות" : "משימות שבוצעו"}
            </label>
            <textarea
              value={activeTab === "planned" ? plannedTasks : actualTasks}
              onChange={(e) => activeTab === "planned" ? setPlannedTasks(e.target.value) : setActualTasks(e.target.value)}
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="משימות (שורה לכל משימה)..."
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">הערות</label>
            <input
              value={activeTab === "planned" ? plannedNotes : actualNotes}
              onChange={(e) => activeTab === "planned" ? setPlannedNotes(e.target.value) : setActualNotes(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="הערות..."
            />
          </div>

          {/* Soldiers */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">
              חיילים ({currentIds.length} נבחרו)
            </label>
            <div className="flex gap-2 mb-2 flex-wrap">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[150px]"
                placeholder="🔍 חיפוש חייל..."
              />
              <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm">
                <option value="">כל הפלוגות</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Selected soldiers */}
            {currentIds.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {currentIds.map((id) => {
                  const s = soldiers.find((x) => x.id === id);
                  if (!s) return null;
                  return (
                    <span key={id} className={`text-xs rounded-full px-2 py-0.5 flex items-center gap-1 ${activeTab === "planned" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                      {s.fullName}
                      <button onClick={() => toggleSoldier(id)} className="hover:text-rose-600">✕</button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Soldier list */}
            <div className="border rounded-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
              {filteredSoldiers.map((s) => {
                const checked = currentIds.includes(s.id);
                return (
                  <label key={s.id} className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-blue-50 ${checked ? (activeTab === "planned" ? "bg-amber-50" : "bg-emerald-50") : ""}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleSoldier(s.id)} className="w-3.5 h-3.5" />
                    <span className="font-medium">{s.fullName}</span>
                    {s.personalNumber && <span className="text-[10px] text-slate-400 font-mono">{s.personalNumber}</span>}
                    {s.companyName && <span className="text-[10px] text-slate-400">({s.companyName})</span>}
                  </label>
                );
              })}
              {filteredSoldiers.length === 0 && (
                <div className="text-center text-xs text-slate-400 py-3">לא נמצאו חיילים</div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 p-4 flex items-center justify-between bg-slate-50">
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">ביטול</button>
          <button
            onClick={handleSave}
            disabled={pending}
            className="bg-blue-700 text-white rounded-lg px-6 py-2 text-sm font-bold hover:bg-blue-800 disabled:opacity-50"
          >
            {pending ? "שומר..." : "💾 שמירה"}
          </button>
        </div>
      </div>
    </div>
  );
}
