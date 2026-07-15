"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, Card, Badge } from "@/components/ui";
import { createBoard, deleteBoard, addSlot, deleteSlot, assignSoldier, unassignSoldier, updateBoard, autoFillBoard } from "./actions";
import MonthCalendar from "./MonthCalendar";

type Slot = {
  id: string; date: string; startTime: string | null; endTime: string | null; label: string | null; capacity: number;
  companyName: string | null; squadName: string | null; responsibleName: string | null; canFill: boolean;
  assignments: { id: string; name: string }[];
};
type Detail = { id: string; name: string; defaultStart: string | null; defaultEnd: string | null; notes: string | null; visibility: string; fromDate: string | null; toDate: string | null; canManage: boolean; slots: Slot[] };

// צבע רקע יציב פר-פלוגה (לקריאוּת מהירה של החלוקה)
const COMPANY_COLORS = ["bg-sky-50 border-sky-200", "bg-amber-50 border-amber-200", "bg-violet-50 border-violet-200", "bg-teal-50 border-teal-200", "bg-rose-50 border-rose-200", "bg-lime-50 border-lime-200"];
function companyColor(name: string | null): string {
  if (!name) return "bg-white border-slate-200";
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COMPANY_COLORS[h % COMPANY_COLORS.length];
}
type Board = { id: string; name: string; visibility: string; fromDate: string | null; toDate: string | null; createdByName: string | null; slotCount: number; canManage: boolean };

export default function DutyClient({ isManager, boards, detail, companies, squads, soldiers }: {
  isManager: boolean;
  boards: Board[]; detail: Detail | null;
  companies: { id: string; name: string }[]; squads: { id: string; name: string }[]; soldiers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showNew, setShowNew] = useState(false);
  const [showSlot, setShowSlot] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [calView, setCalView] = useState<"list" | "cal">("list");
  const [slotDate, setSlotDate] = useState("");
  const open = (id: string) => router.push(`/duty?board=${id}`);
  const act = (fn: (fd: FormData) => Promise<{ error?: string; ok?: boolean }>, fd: FormData, done?: () => void) =>
    start(async () => { const r = await fn(fd); if (r.error) alert(r.error); else done?.(); });

  // ===== תצוגת לוח בודד =====
  if (detail) {
    const byDate = new Map<string, Slot[]>();
    for (const s of detail.slots) { const a = byDate.get(s.date) ?? []; a.push(s); byDate.set(s.date, a); }
    const countByDate = Object.fromEntries([...byDate].map(([d, arr]) => [d, arr.length]));
    return (
      <div>
        <PageHeader title={`🗓️ ${detail.name}`} subtitle={`${detail.slots.length} משבצות${detail.fromDate ? ` · ${detail.fromDate}${detail.toDate ? `→${detail.toDate}` : ""}` : ""}`}
          action={<button onClick={() => router.push("/duty")} className="text-sm text-blue-600 hover:underline">← כל הלוחות</button>} />

        {/* עריכת לוח — יוזם/מפמ */}
        {detail.canManage && showEdit && (
          <Card className="mb-4 p-4 border-indigo-200">
            <div className="text-sm font-semibold text-indigo-700 mb-2">✏️ עריכת לוח</div>
            <form action={(fd) => { fd.set("id", detail.id); act(updateBoard, fd, () => setShowEdit(false)); }} className="flex flex-wrap items-end gap-3">
              <div><label className="text-xs text-slate-500 block mb-1">שם</label><input name="name" required defaultValue={detail.name} className="rounded border border-slate-300 px-2 py-1 text-sm" /></div>
              <div><label className="text-xs text-slate-500 block mb-1">מתאריך</label><input type="date" name="fromDate" defaultValue={detail.fromDate ?? ""} className="rounded border border-slate-300 px-2 py-1 text-sm" /></div>
              <div><label className="text-xs text-slate-500 block mb-1">עד תאריך</label><input type="date" name="toDate" defaultValue={detail.toDate ?? ""} className="rounded border border-slate-300 px-2 py-1 text-sm" /></div>
              <div><label className="text-xs text-slate-500 block mb-1">שעות ברירת-מחדל</label><span className="flex items-center gap-1"><input type="time" name="defaultStart" defaultValue={detail.defaultStart ?? ""} className="rounded border border-slate-300 px-2 py-1 text-sm" /><span>-</span><input type="time" name="defaultEnd" defaultValue={detail.defaultEnd ?? ""} className="rounded border border-slate-300 px-2 py-1 text-sm" /></span></div>
              <div><label className="text-xs text-slate-500 block mb-1">נראוּת</label><select name="visibility" defaultValue={detail.visibility} className="rounded border border-slate-300 px-2 py-1 text-sm"><option value="ALL">כל המשתמשים</option><option value="SELECTED">נבחרים בלבד</option></select></div>
              <button disabled={pending} className="bg-indigo-600 text-white rounded px-4 py-1.5 text-sm disabled:opacity-50">שמור</button>
              <button type="button" onClick={() => setShowEdit(false)} className="text-sm text-slate-400">ביטול</button>
            </form>
          </Card>
        )}

        {detail.canManage && (
          <Card className="mb-4 p-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setShowSlot((v) => !v)} className="text-sm bg-blue-600 text-white rounded px-3 py-1.5 hover:bg-blue-700">➕ משבצת חדשה</button>
              <button onClick={() => { setShowEdit((v) => !v); setShowSlot(false); }} className="text-sm bg-indigo-50 border border-indigo-200 text-indigo-700 rounded px-3 py-1.5 hover:bg-indigo-100">✏️ ערוך לוח</button>
              <form
                action={(fd) => {
                  if (!confirm("לשבץ אוטומטית את כל המשבצות הפנויות? החלוקה הוגנת (least-loaded) לפי מחלקה/פלוגה, והחיילים יקבלו התראה בבוט.")) return;
                  fd.set("boardId", detail.id);
                  start(async () => { const r = await autoFillBoard(fd); if (r.error) alert(r.error); else alert(r.filled ? `🤖 שובצו ${r.filled} חיילים אוטומטית ✅` : "אין משבצות פנויות לשיבוץ"); });
                }}
                className="inline"
              >
                <button disabled={pending} className="text-sm bg-emerald-600 text-white rounded px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50">🤖 שבץ אוטומטית</button>
              </form>
            </div>
            {showSlot && (
              <form action={(fd) => act(addSlot, fd, () => setShowSlot(false))} className="flex flex-wrap items-end gap-2 mt-3">
                <input type="hidden" name="boardId" value={detail.id} />
                <div><label className="text-xs text-slate-500 block">תאריך</label><input type="date" name="date" required value={slotDate} onChange={(e) => setSlotDate(e.target.value)} min={detail.fromDate ?? undefined} max={detail.toDate ?? undefined} className="rounded border border-slate-300 px-2 py-1 text-sm" /></div>
                <div><label className="text-xs text-slate-500 block">משעה</label><input type="time" name="startTime" defaultValue={detail.defaultStart ?? ""} className="rounded border border-slate-300 px-2 py-1 text-sm" /></div>
                <div><label className="text-xs text-slate-500 block">עד</label><input type="time" name="endTime" defaultValue={detail.defaultEnd ?? ""} className="rounded border border-slate-300 px-2 py-1 text-sm" /></div>
                <div><label className="text-xs text-slate-500 block">תיאור</label><input name="label" placeholder="עמדה 1" className="rounded border border-slate-300 px-2 py-1 text-sm w-24" /></div>
                <div><label className="text-xs text-slate-500 block">כמות</label><input type="number" name="capacity" defaultValue={1} min={1} className="rounded border border-slate-300 px-2 py-1 text-sm w-16" /></div>
                <div><label className="text-xs text-slate-500 block">פלוגה</label><select name="companyId" className="rounded border border-slate-300 px-2 py-1 text-sm"><option value="">—</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div><label className="text-xs text-slate-500 block">מחלקה</label><select name="squadId" className="rounded border border-slate-300 px-2 py-1 text-sm"><option value="">—</option>{squads.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                <div><label className="text-xs text-slate-500 block">חייל אחראי (למילוי)</label><select name="responsibleSoldierId" className="rounded border border-slate-300 px-2 py-1 text-sm max-w-[150px]"><option value="">—</option>{soldiers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                <button disabled={pending} className="bg-blue-600 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50">הוסף</button>
              </form>
            )}
          </Card>
        )}

        <div className="flex gap-1 mb-3 rounded-lg border border-slate-200 w-fit overflow-hidden text-sm">
          <button onClick={() => setCalView("list")} className={`px-3 py-1 ${calView === "list" ? "bg-blue-600 text-white" : "bg-white text-slate-600"}`}>📋 רשימה</button>
          <button onClick={() => setCalView("cal")} className={`px-3 py-1 ${calView === "cal" ? "bg-blue-600 text-white" : "bg-white text-slate-600"}`}>📅 לוח שנה</button>
        </div>

        {calView === "cal" ? (
          <Card className="p-4">
            <MonthCalendar countByDate={countByDate} onDayClick={(d) => { setSlotDate(d); setCalView("list"); if (detail.canManage) setShowSlot(true); }} />
            {detail.canManage && <p className="text-xs text-slate-400 mt-3 text-center">לחץ על יום כדי להוסיף לו משבצת</p>}
          </Card>
        ) : (<>
        {[...byDate.entries()].map(([date, slots]) => (
          <Card key={date} className="mb-3 overflow-hidden">
            <div className="bg-slate-50 px-4 py-1.5 font-bold text-slate-700 border-b text-sm">📅 {new Date(date).toLocaleDateString("he-IL", { weekday: "short", day: "2-digit", month: "2-digit" })}</div>
            <div className="divide-y divide-slate-100">
              {slots.map((s) => {
                const full = s.assignments.length >= s.capacity;
                return (
                <div key={s.id} className={`px-4 py-2 border-r-4 ${companyColor(s.companyName)}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-sm">
                      <b className="text-base">{s.startTime ? `${s.startTime}${s.endTime ? `–${s.endTime}` : ""}` : "יומי"}</b>
                      {s.label && <span className="font-medium"> · {s.label}</span>}
                      {(s.companyName || s.squadName) && <span className="text-slate-600"> · {s.squadName || s.companyName}</span>}
                      {s.responsibleName && <span className="text-xs text-indigo-600"> · אחראי: {s.responsibleName}</span>}
                      <Badge className={`mr-1 ${full ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{s.assignments.length}/{s.capacity}{full ? " ✓" : ""}</Badge>
                    </div>
                    {detail.canManage && <form action={(fd) => start(async () => { await deleteSlot(fd); })} onSubmit={(e) => { if (!confirm("למחוק משבצת?")) e.preventDefault(); }}><input type="hidden" name="id" value={s.id} /><button className="text-xs text-rose-400 hover:underline">מחק</button></form>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    {s.assignments.map((a) => (
                      <span key={a.id} className="text-xs bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 flex items-center gap-1">{a.name}
                        {s.canFill && <form action={(fd) => start(async () => { await unassignSoldier(fd); })} className="inline"><input type="hidden" name="id" value={a.id} /><button className="text-rose-400">×</button></form>}
                      </span>
                    ))}
                    {s.canFill && (assignFor === s.id ? (
                      <form action={(fd) => act(assignSoldier, fd, () => setAssignFor(null))} className="flex items-center gap-1">
                        <input type="hidden" name="slotId" value={s.id} />
                        <select name="soldierId" className="text-xs rounded border border-slate-300 px-1 py-0.5" defaultValue=""><option value="" disabled>בחר חייל</option>{soldiers.map((sol) => <option key={sol.id} value={sol.id}>{sol.name}</option>)}</select>
                        <button disabled={pending} className="text-xs bg-emerald-600 text-white rounded px-2 py-0.5">שבץ</button>
                        <button type="button" onClick={() => setAssignFor(null)} className="text-xs text-slate-400">ביטול</button>
                      </form>
                    ) : (!full && <button onClick={() => setAssignFor(s.id)} className="text-xs text-blue-600 hover:underline">+ שבץ חייל</button>))}
                    {full && s.canFill && assignFor !== s.id && <span className="text-xs text-emerald-600">מלא ✓</span>}
                  </div>
                </div>);
              })}
            </div>
          </Card>
        ))}
        {detail.slots.length === 0 && <Card className="p-6 text-center text-slate-400">אין משבצות. {detail.canManage ? "הוסף משבצת חדשה." : ""}</Card>}
        </>)}
      </div>
    );
  }

  // ===== רשימת לוחות =====
  return (
    <div>
      <PageHeader title="🗓️ ניהול משמרות / משימות" subtitle="שמירה · ניקיונות · תורני מטבח"
        action={<button onClick={() => setShowNew((v) => !v)} className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700">➕ לוח חדש</button>} />

      {showNew && (
        <Card className="mb-4 p-4">
          <form action={(fd) => act(createBoard, fd, () => setShowNew(false))} className="flex flex-wrap items-end gap-3">
            <div><label className="text-xs text-slate-500 block mb-1">שם הלוח</label><input name="name" required placeholder="שמירה" className="rounded border border-slate-300 px-2 py-1 text-sm" /></div>
            <div><label className="text-xs text-slate-500 block mb-1">מתאריך</label><input type="date" name="fromDate" className="rounded border border-slate-300 px-2 py-1 text-sm" /></div>
            <div><label className="text-xs text-slate-500 block mb-1">עד תאריך</label><input type="date" name="toDate" className="rounded border border-slate-300 px-2 py-1 text-sm" /></div>
            <div><label className="text-xs text-slate-500 block mb-1">שעות ברירת מחדל</label><span className="flex items-center gap-1"><input type="time" name="defaultStart" className="rounded border border-slate-300 px-2 py-1 text-sm" /><span>-</span><input type="time" name="defaultEnd" className="rounded border border-slate-300 px-2 py-1 text-sm" /></span></div>
            <div><label className="text-xs text-slate-500 block mb-1">נראוּת</label><select name="visibility" className="rounded border border-slate-300 px-2 py-1 text-sm"><option value="ALL">כל המשתמשים</option><option value="SELECTED">נבחרים בלבד</option></select></div>
            <button disabled={pending} className="bg-blue-600 text-white rounded px-4 py-1.5 text-sm disabled:opacity-50">צור לוח</button>
          </form>
        </Card>
      )}

      {boards.length === 0 ? <Card className="p-6 text-center text-slate-400">אין לוחות. צור לוח חדש.</Card> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => (
            <Card key={b.id} className="p-4 hover:shadow-md cursor-pointer" >
              <div onClick={() => open(b.id)}>
                <div className="font-bold text-slate-800">🗓️ {b.name}</div>
                <div className="text-xs text-slate-500 mt-1">{b.slotCount} משבצות · {b.visibility === "ALL" ? "גלוי לכולם" : "נבחרים"}{b.fromDate ? ` · ${b.fromDate}${b.toDate ? `→${b.toDate}` : ""}` : ""}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">יוזם: {b.createdByName ?? "—"}</div>
              </div>
              {b.canManage && <form action={(fd) => start(async () => { await deleteBoard(fd); })} onSubmit={(e) => { if (!confirm("למחוק את הלוח?")) e.preventDefault(); }} className="mt-2"><input type="hidden" name="id" value={b.id} /><button className="text-xs text-rose-400 hover:underline">מחק לוח</button></form>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
