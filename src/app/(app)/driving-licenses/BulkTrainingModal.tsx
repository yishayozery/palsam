"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { lookupSoldierByPn, bulkMarkTraining } from "./actions";
import { useEscClose } from "@/lib/useEscClose";

export const DRIVING_REFRESH = "__driving_refresh__";

type Picked = { id: string; pn: string; fullName: string; company: string | null; squad: string | null; prev: string | null };
type CourseType = { id: string; name: string };

/**
 * 🔄 רישום מרוכז להדרכה — מקישים מ.א, המערכת מביאה את השם, ורושמים עשרות במכה.
 * ריענון נהיגה מעדכן את תאריך הריענון; שאר ההדרכות נרשמות כמופע קורס.
 */
export default function BulkTrainingModal({ courseTypes, canOtherTrainings }: {
  courseTypes: CourseType[]; canOtherTrainings: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayStr);
  const [courseTypeId, setCourseTypeId] = useState<string>(DRIVING_REFRESH);
  const [pn, setPn] = useState("");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [lookupErr, setLookupErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [looking, setLooking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEscClose(open, () => setOpen(false));

  async function addByPn() {
    const v = pn.trim();
    if (!v) return;
    setLookupErr(null);
    if (picked.some((p) => p.pn === v)) { setLookupErr("החייל כבר ברשימה"); setPn(""); return; }
    setLooking(true);
    const r = await lookupSoldierByPn(v);
    setLooking(false);
    if (!r.ok) { setLookupErr(r.error); return; }
    setPicked((list) => [...list, { id: r.id, pn: v, fullName: r.fullName, company: r.company, squad: r.squad, prev: r.refresherDate }]);
    setPn("");
    inputRef.current?.focus();
  }

  function reset() { setPicked([]); setPn(""); setErr(null); setOkMsg(null); setLookupErr(null); }

  async function submit() {
    setErr(null); setOkMsg(null);
    if (picked.length === 0) { setErr("הוסף לפחות חייל אחד"); return; }
    setBusy(true);
    const r = await bulkMarkTraining({ courseTypeId, date, soldierIds: picked.map((p) => p.id) });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setOkMsg(`✅ נרשמו ${r.marked} חיילים${r.skipped ? ` · ${r.skipped} דולגו` : ""}`);
    setPicked([]);
    router.refresh();
  }

  const label = courseTypeId === DRIVING_REFRESH ? "ריענון נהיגה" : courseTypes.find((c) => c.id === courseTypeId)?.name ?? "הדרכה";

  return (
    <>
      <button onClick={() => { setOpen(true); reset(); }}
        className="bg-white border border-teal-300 text-teal-700 rounded-lg px-3 py-2 text-xs md:text-sm font-medium hover:bg-teal-50">
        🔄 רישום מרוכז להדרכה
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-0 sm:p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-teal-700 to-teal-800 text-white p-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-lg">🔄 רישום מרוכז להדרכה</h3>
                <p className="text-xs text-teal-200 mt-0.5">מקישים מספר אישי — המערכת מביאה את השם</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-teal-200 hover:text-white text-2xl">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">סוג הדרכה</label>
                  <select value={courseTypeId} onChange={(e) => setCourseTypeId(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
                    <option value={DRIVING_REFRESH}>🚗 ריענון נהיגה</option>
                    {canOtherTrainings && courseTypes.map((c) => <option key={c.id} value={c.id}>🎓 {c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">תאריך ביצוע</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm" />
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                {courseTypeId === DRIVING_REFRESH
                  ? "מעדכן את תאריך ריענון הנהיגה של החייל — משפיע מיד על הזכאות לניפוק רכב."
                  : "נרשם כמופע הדרכה בתאריך שנבחר, ומעניק את ההסמכות שההדרכה מקנה."}
              </p>

              {/* הקלדת מ.א */}
              <div className="border-t border-slate-200 pt-3">
                <label className="block text-[11px] text-slate-600 mb-1">מספר אישי</label>
                <div className="flex gap-2">
                  <input ref={inputRef} value={pn} onChange={(e) => { setPn(e.target.value); setLookupErr(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addByPn(); } }}
                    inputMode="numeric" placeholder="הקלד מ.א ולחץ Enter" autoFocus
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono" />
                  <button onClick={addByPn} disabled={looking || !pn.trim()}
                    className="bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white rounded-lg px-4 py-2.5 text-sm font-medium whitespace-nowrap">
                    {looking ? "מחפש…" : "➕ הוסף"}
                  </button>
                </div>
                {lookupErr && <p className="text-rose-600 text-xs mt-1">{lookupErr}</p>}
              </div>

              {/* הרשימה */}
              {picked.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold text-slate-600">ברשימה ({picked.length})</span>
                    <button onClick={() => setPicked([])} className="mr-auto text-[11px] text-slate-500 hover:underline">נקה הכל</button>
                  </div>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {picked.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-lg px-2 py-1.5">
                        <span className="font-mono text-[11px] text-slate-500 w-16 shrink-0">{p.pn}</span>
                        <span className="text-sm flex-1 min-w-0 truncate">{p.fullName}</span>
                        <span className="text-[11px] text-slate-500 truncate">{p.company ?? "—"}{p.squad ? ` · ${p.squad}` : ""}</span>
                        {courseTypeId === DRIVING_REFRESH && (
                          <span className="text-[10px] text-slate-400 whitespace-nowrap">{p.prev ? `קודם: ${p.prev}` : "אין ריענון"}</span>
                        )}
                        <button onClick={() => setPicked((l) => l.filter((x) => x.id !== p.id))}
                          className="text-slate-400 hover:text-rose-600 text-lg leading-none">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {err && <p className="text-rose-600 text-sm text-center">{err}</p>}
              {okMsg && <p className="text-emerald-700 text-sm text-center font-medium">{okMsg}</p>}
            </div>

            <div className="border-t border-slate-200 p-3 bg-white shrink-0 flex items-center gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm">סגור</button>
              <button onClick={submit} disabled={busy || picked.length === 0}
                className="flex-1 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white rounded-lg px-4 py-2.5 text-sm font-bold">
                {busy ? "רושם…" : `✅ רשום ${label} (${picked.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
