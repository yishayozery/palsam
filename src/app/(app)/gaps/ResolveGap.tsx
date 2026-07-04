"use client";

import { useState } from "react";
import { resolveDiscrepancy, correctCountedQuantity } from "./actions";

export default function ResolveGap({ id, expectedQty }: { id: string; expectedQty?: number }) {
  const [mode, setMode] = useState<"none" | "resolve" | "recount">("none");

  if (mode === "none") {
    return (
      <div className="flex items-center gap-1.5">
        <button onClick={() => setMode("recount")}
          className="text-xs bg-blue-600 text-white rounded-md px-2.5 py-1 hover:bg-blue-700">
          🔄 תקן כמות
        </button>
        <button onClick={() => setMode("resolve")}
          className="text-xs bg-slate-800 text-white rounded-md px-2.5 py-1 hover:bg-slate-900">
          סגירת פער
        </button>
      </div>
    );
  }

  if (mode === "recount") {
    return (
      <form action={correctCountedQuantity} className="flex items-center gap-1.5">
        <input type="hidden" name="id" value={id} />
        <span className="text-xs text-slate-500">כמות נכונה{expectedQty != null ? ` (צפוי ${expectedQty})` : ""}:</span>
        <input name="newCounted" type="number" min={0} required placeholder="כמות"
          className="rounded border border-blue-300 px-2 py-1 text-xs w-20" autoFocus />
        <button className="text-xs bg-blue-600 text-white rounded-md px-2 py-1">שמור</button>
        <button type="button" onClick={() => setMode("none")} className="text-xs text-slate-400">ביטול</button>
      </form>
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
      <button type="button" onClick={() => setMode("none")} className="text-xs text-slate-400">ביטול</button>
    </form>
  );
}
