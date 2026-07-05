"use client";

import { useState } from "react";
import { createBattalion } from "./actions";

export default function BattalionForm() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-900">
        + גדוד חדש
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">הקמת גדוד חדש</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <form action={async (fd) => { await createBattalion(fd); setOpen(false); }} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">שם הגדוד</label>
                  <input name="name" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">מספר גדוד (ספרות בלבד)</label>
                  <input name="code" required inputMode="numeric" pattern="\d+" placeholder="7032"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                    onInput={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/\D/g, ""); }} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">מספר חטיבה (ספרות בלבד)</label>
                <input name="brigade" inputMode="numeric" pattern="\d*" placeholder="401"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  onInput={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/\D/g, ""); }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">מפקד הגדוד (אופציונלי)</label>
                  <input name="commander" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">משפט הגדוד (אופציונלי)</label>
                  <input name="motto" placeholder="לנצח בכל מחיר" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="border-t border-slate-200 pt-3">
                <div className="text-sm font-semibold text-slate-700 mb-2">מנהל מערכת ראשון</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">שם מלא</label>
                    <input name="mafamName" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">שם משתמש</label>
                    <input name="mafamUser" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
                  </div>
                </div>
                <div className="mt-2">
                  <label className="block text-xs text-slate-500 mb-1">טלפון (לשליחת הזמנה)</label>
                  <input name="mafamPhone" placeholder="05X-XXXXXXX" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
              </div>
              <p className="text-xs text-slate-400">הגדוד ייווצר עם 4 מחסנים + סטטוסי בסיס. למנהל המערכת ייווצר קישור הזמנה (יגדיר סיסמה בכניסה ראשונה). ניתן להוסיף מנהלי מערכת נוספים אחרי ההקמה.</p>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
                <button className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm">הקמה</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
