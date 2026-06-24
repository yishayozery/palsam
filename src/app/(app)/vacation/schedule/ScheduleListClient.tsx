"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState } from "@/components/ui";
import { createEvent, deleteEvent } from "./actions";

type EventSummary = {
  id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  startDateFmt: string;
  endDateFmt: string;
  forcesCount: number;
  dayEntriesCount: number;
  forces: { forceName: string; userName: string }[];
  approvers: string[];
  isCreator: boolean;
};

type UserOption = { id: string; fullName: string; title: string | null };

export default function ScheduleListClient({
  events, type, typeLabel, isAdmin, allUsers,
}: {
  events: EventSummary[];
  type: string;
  typeLabel: string;
  isAdmin: boolean;
  allUsers: UserOption[];
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [pending, startTransition] = useTransition();
  const [selectedApprovers, setSelectedApprovers] = useState<string[]>([]);

  async function handleCreate(fd: FormData) {
    fd.set("type", type);
    fd.set("approverIds", JSON.stringify(selectedApprovers));
    startTransition(async () => {
      const res = await createEvent(fd);
      if (res.ok && res.id) {
        setShowCreate(false);
        setSelectedApprovers([]);
        router.push(`/vacation/schedule/${res.id}`);
      }
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("למחוק את האירוע?")) return;
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      await deleteEvent(fd);
      router.refresh();
    });
  }

  function toggleApprover(uid: string) {
    setSelectedApprovers((prev) => prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      {isAdmin && (
        <div className="mb-4">
          {showCreate ? (
            <Card className="p-4">
              <h3 className="font-bold text-sm text-slate-700 mb-3">יצירת {typeLabel} חדש</h3>
              <form action={handleCreate} className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">שם האירוע</label>
                    <input name="name" required className="border rounded-lg px-3 py-2 text-sm w-56" placeholder={type === "PLUGATI" ? "למשל: אלת" : "למשל: כח חלוץ"} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">מתאריך</label>
                    <input name="startDate" type="date" required defaultValue={today} className="border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">עד תאריך</label>
                    <input name="endDate" type="date" required className="border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>

                {/* Approvers */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">גורמים מאשרים</label>
                  <p className="text-[10px] text-slate-400 mb-2">משתמשים שיוכלו לאשר תוכניות יומיות של הכוחות</p>
                  <div className="flex flex-wrap gap-1.5">
                    {allUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleApprover(u.id)}
                        className={`text-xs rounded-full px-2.5 py-1 border transition ${
                          selectedApprovers.includes(u.id)
                            ? "bg-purple-100 border-purple-400 text-purple-800 font-bold"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {u.fullName}{u.title ? ` (${u.title})` : ""}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button disabled={pending} className="bg-emerald-600 text-white rounded-lg px-5 py-2 text-sm font-bold hover:bg-emerald-700 disabled:opacity-50">
                    {pending ? "יוצר..." : "צור אירוע"}
                  </button>
                  <button type="button" onClick={() => { setShowCreate(false); setSelectedApprovers([]); }} className="text-sm text-slate-500 hover:text-slate-800">
                    ביטול
                  </button>
                </div>
              </form>
            </Card>
          ) : (
            <button onClick={() => setShowCreate(true)} className="bg-blue-700 hover:bg-blue-800 text-white rounded-lg px-5 py-2.5 text-sm font-bold shadow-md hover:shadow-lg transition">
              + {typeLabel} חדש
            </button>
          )}
        </div>
      )}

      {events.length === 0 ? (
        <Card className="p-6">
          <EmptyState>
            {isAdmin
              ? `אין אירועי ${typeLabel} — לחץ על הכפתור למעלה כדי ליצור`
              : `אין אירועי ${typeLabel} שאתה משויך אליהם`}
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-3">
          {events.map((e) => (
            <Card key={e.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 cursor-pointer hover:text-blue-600 transition" onClick={() => router.push(`/vacation/schedule/${e.id}`)}>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg">{e.name}</h3>
                    {e.isCreator && <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">יוצר</span>}
                  </div>
                  <div className="text-sm text-slate-500 mt-1 flex gap-4 flex-wrap">
                    <span>📅 {e.startDateFmt} — {e.endDateFmt}</span>
                    <span>👥 {e.forcesCount} כוחות</span>
                    <span>📝 {e.dayEntriesCount} רשומות</span>
                  </div>
                  {e.forces.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {e.forces.map((f, i) => (
                        <span key={i} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">
                          {f.forceName} ({f.userName})
                        </span>
                      ))}
                    </div>
                  )}
                  {e.approvers.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap items-center">
                      <span className="text-[10px] text-purple-600">מאשרים:</span>
                      {e.approvers.map((name, i) => (
                        <span key={i} className="text-[10px] bg-purple-50 text-purple-700 rounded px-1.5 py-0.5">{name}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => router.push(`/vacation/schedule/${e.id}`)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                    פתח
                  </button>
                  {(isAdmin || e.isCreator) && (
                    <button onClick={() => handleDelete(e.id)} className="px-3 py-1.5 text-rose-500 hover:bg-rose-50 rounded-lg text-sm">
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
