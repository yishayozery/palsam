"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { addForce, removeForce, saveDayEntry, approveDayEntry } from "../actions";

type SoldierRef = { id: string; name: string; company?: string | null; companyId?: string | null; role?: string | null };
type DayEntryData = {
  id: string;
  plannedTasks: string | null;
  actualTasks: string | null;
  plannedNotes: string | null;
  actualNotes: string | null;
  approved: boolean;
  approvedAt: string | null;
  approvedById: string | null;
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
  roleName: string | null;
};

function groupByCompany(soldiers: SoldierRef[]) {
  const groups: Record<string, SoldierRef[]> = {};
  for (const s of soldiers) {
    const key = s.company || "ללא פלוגה";
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}

export default function EventClient({
  eventId, eventName, eventType, startDate, endDate, notes,
  createdById, currentUserId, isAdmin, dates, forces: initialForces,
  allUsers, soldiers, companies, battalionName, battalionLogo,
  approverIds, approverNames, isApprover,
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
  battalionName: string;
  battalionLogo: string | null;
  approverIds: string[];
  approverNames: string[];
  isApprover: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showAddForce, setShowAddForce] = useState(false);
  const [editingCell, setEditingCell] = useState<{ forceId: string; date: string; phase: "planned" | "actual" } | null>(null);
  const canManage = isAdmin || createdById === currentUserId;

  const fmtDay = (d: string) => {
    const dt = new Date(d + "T00:00:00");
    const dayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
    const shortDays = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
    return {
      full: `יום ${dayNames[dt.getDay()]}`,
      short: shortDays[dt.getDay()],
      date: `${dt.getDate()}/${dt.getMonth() + 1}`,
    };
  };

  async function handleAddForce(fd: FormData) {
    fd.set("eventId", eventId);
    startTransition(async () => {
      const res = await addForce(fd);
      if (res.ok) { setShowAddForce(false); router.refresh(); }
    });
  }

  async function handleRemoveForce(forceId: string) {
    if (!confirm("להסיר את הכח מהאירוע?")) return;
    const fd = new FormData();
    fd.set("forceId", forceId);
    startTransition(async () => { await removeForce(fd); router.refresh(); });
  }

  async function handleApprove(entryId: string, approve: boolean) {
    const fd = new FormData();
    fd.set("entryId", entryId);
    fd.set("approve", String(approve));
    startTransition(async () => { await approveDayEntry(fd); router.refresh(); });
  }

  const canEditForce = (force: Force) => isAdmin || createdById === currentUserId || force.userId === currentUserId;

  const generateShareText = useCallback(() => {
    const typeLabel = eventType === "PLUGATI" ? "לוז מפורט יומי" : "מקדים/מאסף";
    const fmtD = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
    let text = `🏛️ *${battalionName}*\n📋 *${eventName}* — ${typeLabel}\n📅 ${fmtD(startDate)} — ${fmtD(endDate)}\n\n`;
    for (const d of dates) {
      const { full, date } = fmtDay(d);
      let dayHasContent = false;
      let dayText = `📅 *${full} ${date}*\n`;
      for (const force of initialForces) {
        const entry = force.dayEntries[d];
        if (!entry) continue;
        const pCount = entry.plannedSoldiers?.length ?? 0;
        const aCount = entry.actualSoldiers?.length ?? 0;
        if (pCount === 0 && aCount === 0 && !entry.plannedTasks) continue;
        dayHasContent = true;
        dayText += `  👥 ${force.forceName}:\n`;
        if (entry.plannedTasks) dayText += `  📝 משימות: ${entry.plannedTasks.split("\n").join(", ")}\n`;
        if (pCount > 0) {
          const groups = groupByCompany(entry.plannedSoldiers);
          for (const [company, soldiers] of groups) {
            dayText += `    ${company}: ${soldiers.map((s) => `${s.name}${s.role ? ` (${s.role})` : ""}`).join(", ")}\n`;
          }
          dayText += `  סה"כ תכנון: ${pCount}\n`;
        }
        if (aCount > 0) dayText += `  ביצוע: ${aCount}/${pCount}\n`;
        if (entry.approved) dayText += `  ✅ מאושר\n`;
      }
      if (dayHasContent) text += dayText + "\n";
    }
    return text.trim();
  }, [initialForces, dates, eventName, eventType, startDate, endDate, battalionName]);

  const [copied, setCopied] = useState(false);
  const editingForce = editingCell ? initialForces.find((f) => f.id === editingCell.forceId) : null;
  const editingEntry = editingForce && editingCell ? editingForce.dayEntries[editingCell.date] : null;

  return (
    <div className="space-y-4">
      {/* Share bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {approverNames.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-purple-600 font-bold">מאשרים:</span>
            {approverNames.map((name, i) => (
              <span key={i} className="text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5">{name}</span>
            ))}
          </div>
        )}
        <div className="mr-auto flex gap-2">
          <button onClick={() => { navigator.clipboard?.writeText(generateShareText()); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="text-xs bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1.5">
            {copied ? "✓ הועתק" : "📋 העתק"}
          </button>
          <a href={`https://wa.me/?text=${encodeURIComponent(generateShareText())}`} target="_blank" rel="noreferrer"
            className="text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-lg px-3 py-1.5">
            📲 שלח בוואטסאפ
          </a>
        </div>
      </div>

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
                  {allUsers.map((u) => <option key={u.id} value={u.id}>{u.fullName}{u.title ? ` (${u.title})` : ""}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">שם הכח</label>
                <input name="forceName" required className="border rounded-lg px-3 py-2 text-sm w-48" placeholder="למשל: צוות רחפנים" />
              </div>
              <button disabled={pending} className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-emerald-700 disabled:opacity-50">הוסף</button>
            </form>
          )}
          {initialForces.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {initialForces.map((f) => (
                <div key={f.id} className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                  <span className="text-sm font-bold text-blue-800">{f.forceName}</span>
                  <span className="text-xs text-blue-600">({f.userName})</span>
                  {canManage && <button onClick={() => handleRemoveForce(f.id)} className="text-xs text-rose-400 hover:text-rose-600">✕</button>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">אין כוחות מוזמנים — הוסף כח כדי להתחיל</p>
          )}
        </Card>
      )}

      {/* Day-by-day detailed view */}
      {initialForces.length > 0 && dates.map((d) => {
        const { full, short, date } = fmtDay(d);
        const isToday = d === new Date().toISOString().slice(0, 10);

        return (
          <Card key={d} className={`overflow-hidden ${isToday ? "ring-2 ring-blue-400" : ""}`}>
            {/* Day header */}
            <div className={`px-4 py-2.5 flex items-center justify-between ${isToday ? "bg-blue-800 text-white" : "bg-slate-800 text-white"}`}>
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold">{date}</span>
                <span className="text-sm text-slate-300">{full}</span>
                {isToday && <span className="text-[10px] bg-blue-500 rounded-full px-2 py-0.5">היום</span>}
              </div>
            </div>

            {/* Forces for this day */}
            <div className="divide-y divide-slate-100">
              {initialForces.map((force) => {
                const entry = force.dayEntries[d];
                const planned = entry?.plannedSoldiers ?? [];
                const actual = entry?.actualSoldiers ?? [];
                const editable = canEditForce(force);
                const plannedGroups = groupByCompany(planned);
                const actualGroups = groupByCompany(actual);
                const missingIds = new Set(planned.map((s) => s.id));
                actual.forEach((s) => missingIds.delete(s.id));
                const missing = planned.filter((s) => missingIds.has(s.id));

                return (
                  <div key={force.id} className="p-4">
                    {/* Force header */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-800">{force.forceName}</span>
                        <span className="text-xs text-slate-400">({force.userName})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {entry?.approved && <span className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 font-bold">✔ מאושר</span>}
                        {isApprover && entry && !entry.approved && planned.length > 0 && (
                          <button onClick={() => handleApprove(entry.id, true)} disabled={pending}
                            className="text-xs bg-purple-100 text-purple-700 rounded-lg px-2 py-1 hover:bg-purple-200 font-bold">
                            ✔ אשר
                          </button>
                        )}
                        {isApprover && entry?.approved && (
                          <button onClick={() => handleApprove(entry.id, false)} disabled={pending}
                            className="text-xs text-amber-600 hover:underline">
                            בטל אישור
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Tasks column */}
                      <div className="bg-slate-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-slate-600">📝 משימות</span>
                          {editable && (
                            <button onClick={() => setEditingCell({ forceId: force.id, date: d, phase: "planned" })}
                              className="text-[10px] text-blue-600 hover:underline">✏️ ערוך</button>
                          )}
                        </div>
                        {entry?.plannedTasks ? (
                          <div className="text-xs text-slate-700 whitespace-pre-line">{entry.plannedTasks}</div>
                        ) : (
                          <div className="text-xs text-slate-300">אין משימות</div>
                        )}
                        {entry?.plannedNotes && (
                          <div className="text-[10px] text-slate-400 mt-1 border-t pt-1">{entry.plannedNotes}</div>
                        )}
                      </div>

                      {/* Planned column */}
                      <div className="bg-amber-50/50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-amber-700">📋 תכנון ({planned.length})</span>
                          {editable && (
                            <button onClick={() => setEditingCell({ forceId: force.id, date: d, phase: "planned" })}
                              className="text-[10px] text-blue-600 hover:underline">✏️ ערוך</button>
                          )}
                        </div>
                        {plannedGroups.length > 0 ? (
                          <div className="space-y-1.5">
                            {plannedGroups.map(([company, groupSoldiers]) => (
                              <div key={company}>
                                <div className="text-[10px] font-bold text-slate-500 mb-0.5">{company} ({groupSoldiers.length})</div>
                                {groupSoldiers.map((s) => (
                                  <div key={s.id} className="text-xs text-slate-700 flex items-center gap-1 pr-2">
                                    <span>•</span>
                                    <span>{s.name}</span>
                                    {s.role && <span className="text-[10px] text-purple-600">({s.role})</span>}
                                  </div>
                                ))}
                              </div>
                            ))}
                            <div className="text-[10px] font-bold text-amber-800 border-t border-amber-200 pt-1 mt-1">
                              סה&quot;כ: {planned.length} חיילים
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-300">לא שובצו חיילים</div>
                        )}
                      </div>

                      {/* Actual column */}
                      <div className={`rounded-lg p-3 ${actual.length > 0 ? "bg-emerald-50/50" : "bg-slate-50"}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-emerald-700">✅ בפועל ({actual.length}/{planned.length})</span>
                          {editable && (
                            <button onClick={() => setEditingCell({ forceId: force.id, date: d, phase: "actual" })}
                              className="text-[10px] text-blue-600 hover:underline">✏️ ערוך</button>
                          )}
                        </div>
                        {actualGroups.length > 0 ? (
                          <div className="space-y-1.5">
                            {actualGroups.map(([company, groupSoldiers]) => (
                              <div key={company}>
                                <div className="text-[10px] font-bold text-slate-500 mb-0.5">{company} ({groupSoldiers.length})</div>
                                {groupSoldiers.map((s) => (
                                  <div key={s.id} className="text-xs text-slate-700 flex items-center gap-1 pr-2">
                                    <span>•</span>
                                    <span>{s.name}</span>
                                    {s.role && <span className="text-[10px] text-purple-600">({s.role})</span>}
                                  </div>
                                ))}
                              </div>
                            ))}
                            <div className="text-[10px] font-bold text-emerald-800 border-t border-emerald-200 pt-1 mt-1">
                              סה&quot;כ: {actual.length}/{planned.length}
                              {missing.length > 0 && (
                                <span className="text-rose-600 font-normal mr-2">
                                  חסרים: {missing.map((s) => s.name).join(", ")}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : planned.length > 0 ? (
                          <div className="text-xs text-slate-400">טרם עודכן</div>
                        ) : (
                          <div className="text-xs text-slate-300">—</div>
                        )}
                        {entry?.actualNotes && (
                          <div className="text-[10px] text-slate-400 mt-1 border-t pt-1">{entry.actualNotes}</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      {/* Editor modal */}
      {editingCell && editingForce && (
        <SoldierEditor
          eventId={eventId}
          forceId={editingCell.forceId}
          forceName={editingForce.forceName}
          date={editingCell.date}
          phase={editingCell.phase}
          entry={editingEntry ?? null}
          soldiers={soldiers}
          companies={companies}
          onClose={() => setEditingCell(null)}
        />
      )}
    </div>
  );
}

// ========== Soldier Editor (simplified — edits one phase at a time) ==========
function SoldierEditor({
  eventId, forceId, forceName, date, phase, entry, soldiers, companies, onClose,
}: {
  eventId: string;
  forceId: string;
  forceName: string;
  date: string;
  phase: "planned" | "actual";
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
  const [filterCompany, setFilterCompany] = useState("");
  const [search, setSearch] = useState("");

  const fmtDate = new Date(date + "T00:00:00").toLocaleDateString("he-IL", { weekday: "short", day: "numeric", month: "long" });
  const isPlanned = phase === "planned";
  const currentIds = isPlanned ? plannedIds : actualIds;
  const setCurrentIds = isPlanned ? setPlannedIds : setActualIds;

  const filteredSoldiers = soldiers.filter((s) => {
    if (filterCompany && s.companyId !== filterCompany) return false;
    if (search && !s.fullName.includes(search) && !(s.personalNumber || "").includes(search)) return false;
    return true;
  });

  // For actual phase, show planned soldiers first
  const sortedSoldiers = isPlanned
    ? filteredSoldiers
    : [...filteredSoldiers].sort((a, b) => {
        const aPlanned = plannedIds.includes(a.id) ? 0 : 1;
        const bPlanned = plannedIds.includes(b.id) ? 0 : 1;
        return aPlanned - bPlanned;
      });

  function toggleSoldier(id: string) {
    setCurrentIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function selectAllPlanned() {
    setActualIds([...plannedIds]);
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
      if (res.ok) { onClose(); router.refresh(); }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className={`p-4 flex items-center justify-between ${isPlanned ? "bg-amber-600" : "bg-emerald-700"} text-white`}>
          <div>
            <h2 className="font-bold">{forceName} — {isPlanned ? "תכנון" : "בפועל"}</h2>
            <div className="text-sm opacity-80">{fmtDate}</div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl">✕</button>
        </div>

        <div className="overflow-y-auto max-h-[65vh] p-4 space-y-3">
          {/* Tasks & notes (only in planned phase) */}
          {isPlanned && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">📝 משימות צפויות</label>
                <textarea value={plannedTasks} onChange={(e) => setPlannedTasks(e.target.value)}
                  rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="שורה לכל משימה..." />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">הערות</label>
                <input value={plannedNotes} onChange={(e) => setPlannedNotes(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="הערות..." />
              </div>
            </>
          )}

          {!isPlanned && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">📝 משימות שבוצעו</label>
                <textarea value={actualTasks} onChange={(e) => setActualTasks(e.target.value)}
                  rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="מה בוצע בפועל..." />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">הערות</label>
                <input value={actualNotes} onChange={(e) => setActualNotes(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="הערות..." />
              </div>
              {plannedIds.length > 0 && (
                <button onClick={selectAllPlanned} className="text-xs bg-blue-50 text-blue-700 rounded-lg px-3 py-1.5 hover:bg-blue-100">
                  📋 העתק את כל התכנון ({plannedIds.length})
                </button>
              )}
            </>
          )}

          {/* Soldiers */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">חיילים ({currentIds.length} נבחרו)</label>
            <div className="flex gap-2 mb-2 flex-wrap">
              <input value={search} onChange={(e) => setSearch(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[140px]" placeholder="🔍 חיפוש..." />
              <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm">
                <option value="">כל הפלוגות</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {currentIds.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {currentIds.map((id) => {
                  const s = soldiers.find((x) => x.id === id);
                  if (!s) return null;
                  return (
                    <span key={id} className={`text-xs rounded-full px-2 py-0.5 flex items-center gap-1 ${isPlanned ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                      {s.fullName}
                      <button onClick={() => toggleSoldier(id)} className="hover:text-rose-600">✕</button>
                    </span>
                  );
                })}
              </div>
            )}

            <div className="border rounded-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
              {sortedSoldiers.map((s) => {
                const checked = currentIds.includes(s.id);
                const wasPlanned = !isPlanned && plannedIds.includes(s.id);
                return (
                  <label key={s.id} className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-blue-50 ${
                    checked ? (isPlanned ? "bg-amber-50" : "bg-emerald-50") : wasPlanned ? "bg-blue-50/50" : ""
                  }`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleSoldier(s.id)} className="w-3.5 h-3.5" />
                    <span className="font-medium">{s.fullName}</span>
                    {s.roleName && <span className="text-[10px] text-purple-600">({s.roleName})</span>}
                    {s.companyName && <span className="text-[10px] text-slate-400">{s.companyName}</span>}
                    {wasPlanned && <span className="text-[10px] text-blue-500 mr-auto">📋</span>}
                  </label>
                );
              })}
              {sortedSoldiers.length === 0 && <div className="text-center text-xs text-slate-400 py-3">לא נמצאו חיילים</div>}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 p-4 flex items-center justify-between bg-slate-50">
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">ביטול</button>
          <button onClick={handleSave} disabled={pending}
            className={`text-white rounded-lg px-6 py-2 text-sm font-bold disabled:opacity-50 ${isPlanned ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-700 hover:bg-emerald-800"}`}>
            {pending ? "שומר..." : "💾 שמירה"}
          </button>
        </div>
      </div>
    </div>
  );
}
