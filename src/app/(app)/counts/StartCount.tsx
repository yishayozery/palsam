"use client";

import { useState } from "react";
import { startCount } from "./actions";

type Holder = { id: string; name: string };

export default function StartCount({ holders }: { holders: Holder[] }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("WAREHOUSE");

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-900">
        + פתיחת ספירה
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">פתיחת ספירת מלאי</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <form action={startCount} className="p-5 space-y-4">
              <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2">
                תיווצר תכנית ספירה חד-פעמית + משימת ביצוע אוטומטית.
              </p>
              <div>
                <label className="block text-xs text-slate-500 mb-1">סוג ספירה</label>
                <select name="type" value={type} onChange={(e) => setType(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="WAREHOUSE">מחסן בלבד</option>
                  <option value="COMPANY">פלוגתית</option>
                  <option value="GLOBAL">רוחבית (הקפאת מצב + חתימות חיילים)</option>
                </select>
              </div>
              {type === "COMPANY" && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">מיקוד למחזיק</label>
                  <select name="scopeHolderId" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="">כל הפלוגות והנשקייה</option>
                    {holders.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                </div>
              )}
              {type === "GLOBAL" && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
                  ספירה רוחבית מקפיאה מצב ומאמתת סנכרונית בכל הרמות: מחסן + פלוגות + חתימות חיילים.
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
                <button className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm">פתיחה</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
