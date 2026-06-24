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
};

export default function ScheduleListClient({
  events,
  type,
  typeLabel,
  isAdmin,
}: {
  events: EventSummary[];
  type: string;
  typeLabel: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [pending, startTransition] = useTransition();

  async function handleCreate(fd: FormData) {
    fd.set("type", type);
    startTransition(async () => {
      const res = await createEvent(fd);
      if (res.ok && res.id) {
        setShowCreate(false);
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

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      {isAdmin && (
        <div className="mb-4">
          {showCreate ? (
            <Card className="p-4">
              <form action={handleCreate} className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">שם האירוע</label>
                  <input name="name" required className="border rounded-lg px-3 py-2 text-sm w-56" placeholder={typeLabel === "מקדים/מאסף" ? 'למשל: כח חלוץ' : 'למשל: אלת'} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">מתאריך</label>
                  <input name="startDate" type="date" required defaultValue={today} className="border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">עד תאריך</label>
                  <input name="endDate" type="date" required className="border rounded-lg px-3 py-2 text-sm" />
                </div>
                <button disabled={pending} className="bg-emerald-600 text-white rounded-lg px-5 py-2 text-sm font-bold hover:bg-emerald-700 disabled:opacity-50">
                  {pending ? "יוצר..." : "צור אירוע"}
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="text-sm text-slate-500 hover:text-slate-800">
                  ביטול
                </button>
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
              : `אין אירועי ${typeLabel} פעילים`}
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-3">
          {events.map((e) => (
            <Card key={e.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 cursor-pointer hover:text-blue-600 transition" onClick={() => router.push(`/vacation/schedule/${e.id}`)}>
                  <h3 className="font-bold text-lg">{e.name}</h3>
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
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => router.push(`/vacation/schedule/${e.id}`)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                    פתח
                  </button>
                  {isAdmin && (
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
