"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SCREEN_HELP } from "@/lib/screenHelp";

/** כפתור ❓ בכותרת מסך — route-aware. יש תוכן ייעודי → מציג; אין → הסבר גנרי + לינק למקראה. */
export default function HelpButton({ helpKey }: { helpKey?: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const key = helpKey ?? (pathname?.split("/")[1] || "");
  const help = SCREEN_HELP[key];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="עזרה — מה המסך הזה עושה?"
        aria-label="עזרה"
        className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full hover:bg-slate-100 transition text-base leading-none"
      >
        ℹ️
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">❓ {help?.title ?? "עזרה"}</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              {help ? (
                <>
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
                </>
              ) : (
                <p className="text-slate-600 leading-relaxed">אין עדיין הסבר ייעודי למסך זה. למדריך המלא של המערכת:</p>
              )}
              <Link href="/help" onClick={() => setOpen(false)} className="inline-block text-blue-600 hover:underline text-sm font-medium pt-1">
                📖 מקראת השימוש המלאה →
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
