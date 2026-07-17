"use client";

import { useState, useTransition } from "react";
import { resendTransferEmail } from "../actions";

/** כפתור "שלח למייל" עם משוב מפורש (הצלחה + נמענים / הודעת שגיאה) — לא כשל שקט. */
export default function SendDocEmailButton({ transferId }: { transferId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="relative print:hidden">
      <button
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await resendTransferEmail(transferId);
            setMsg(r.ok
              ? { ok: true, text: `נשלח ל: ${(r.recipients ?? []).join(", ") || "הנמענים המוגדרים"}` }
              : { ok: false, text: r.error ?? "שגיאה בשליחה" });
          })
        }
        disabled={pending}
        className="bg-sky-600 hover:bg-sky-700 text-white rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50">
        {pending ? "שולח…" : "✉️ שלח למייל"}
      </button>
      {msg && (
        <div className={`absolute top-full mt-1 left-0 z-20 max-w-[280px] rounded-lg px-3 py-2 text-xs shadow-lg border ${msg.ok ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-rose-50 border-rose-300 text-rose-800"}`}>
          <span className="font-medium">{msg.ok ? "✅ " : "❌ "}</span>{msg.text}
          <button onClick={() => setMsg(null)} className="mr-2 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}
    </div>
  );
}
