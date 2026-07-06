"use client";

import { useState } from "react";
import { SCREEN_HELP } from "@/lib/screenHelp";

/** כפתור ❓ בכותרת מסך — פותח פאנל עם "מה המסך עושה + איך מגדירים". */
export default function HelpButton({ helpKey }: { helpKey: string }) {
  const [open, setOpen] = useState(false);
  const help = SCREEN_HELP[helpKey];
  if (!help) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="מה המסך הזה עושה?"
        className="shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-sm font-bold hover:bg-blue-200 transition"
      >
        ?
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">❓ {help.title}</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <p className="text-slate-700 leading-relaxed">{help.what}</p>
              {help.howto.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-slate-500 mb-1">איך עובדים / מגדירים:</div>
                  <ul className="space-y-1 text-slate-600">
                    {help.howto.map((line, i) => (
                      <li key={i} className="flex gap-2"><span className="text-blue-500">•</span><span>{line}</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
