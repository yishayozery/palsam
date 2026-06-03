"use client";

import { useState } from "react";
import { resolveDiscrepancy } from "./actions";

export default function ResolveGap({ id }: { id: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="text-xs bg-slate-800 text-white rounded-md px-2.5 py-1 hover:bg-slate-900">
        סגירת פער
      </button>
    );
  }

  return (
    <form action={resolveDiscrepancy} className="flex items-center gap-1.5">
      <input type="hidden" name="id" value={id} />
      <input name="resolution" placeholder="החלטה / הסבר"
        className="rounded border border-slate-300 px-2 py-1 text-xs w-32" />
      <label className="flex items-center gap-1 text-xs text-slate-500">
        <input type="checkbox" name="adjust" /> יישור מלאי
      </label>
      <button className="text-xs bg-emerald-600 text-white rounded-md px-2 py-1">סגור</button>
    </form>
  );
}
