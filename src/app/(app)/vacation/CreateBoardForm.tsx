"use client";

import { useState } from "react";
import { saveBoard } from "./actions";

export default function CreateBoardForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
      >
        + לוח חדש
      </button>
    );
  }

  return (
    <form
      action={async (fd) => { await saveBoard(fd); setOpen(false); }}
      className="mb-4 p-4 bg-white border border-slate-200 rounded-xl space-y-3"
    >
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-slate-500 block mb-1">שם הלוח</label>
          <input name="name" defaultValue="לוח זמינות 7-8/2026" required className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">תאריך התחלה</label>
          <input name="startDate" type="date" defaultValue="2026-07-01" required className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">תאריך סיום</label>
          <input name="endDate" type="date" defaultValue="2026-08-31" required className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">צור</button>
        <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 bg-slate-200 rounded-lg text-sm">ביטול</button>
      </div>
    </form>
  );
}
