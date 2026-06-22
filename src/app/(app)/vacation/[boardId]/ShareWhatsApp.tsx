"use client";

import { useState } from "react";

type Assignee = {
  id: string;
  fullName: string;
  phone: string | null;
  passwordSet: boolean;
  inviteToken: string | null;
};

export default function ShareWhatsApp({
  boardName,
  boardUrl,
  baseUrl,
  assignees,
}: {
  boardName: string;
  boardUrl: string;
  baseUrl: string;
  assignees: Assignee[];
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const message = `📋 *${boardName}*\n\nשלום! נפתח לוח זמינות חדש.\nאנא עדכנו את הימים בהם אתם זמינים / בחופשה.\n\n🔗 קישור: ${boardUrl}\n\nנא להיכנס ולעדכן בהקדם. תודה! 🙏`;

  const broadcastWaUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 flex items-center gap-2"
      >
        📲 שלח בוואטסאפ
      </button>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-sm">📲 שליחה בוואטסאפ</h4>
        <button onClick={() => setOpen(false)} className="text-slate-400 text-sm">✕</button>
      </div>

      {/* הודעה מרוכזת */}
      <div>
        <div className="text-xs text-slate-500 mb-1">הודעה כללית (העתק ושלח לקבוצה):</div>
        <div className="bg-slate-50 border rounded-lg p-3 text-sm whitespace-pre-wrap font-sans">{message}</div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => {
              navigator.clipboard?.writeText(message);
              setCopied("msg");
              setTimeout(() => setCopied(null), 2000);
            }}
            className="text-xs px-3 py-1.5 bg-slate-100 rounded-lg hover:bg-slate-200"
          >
            {copied === "msg" ? "✓ הועתק" : "📋 העתק הודעה"}
          </button>
          <a
            href={broadcastWaUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200"
          >
            📲 פתח בוואטסאפ
          </a>
        </div>
      </div>

      {/* שליחה אישית */}
      <div>
        <div className="text-xs text-slate-500 mb-2">שליחה אישית:</div>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {assignees.map((a) => {
            const registered = a.passwordSet;
            const personalMsg = registered
              ? message
              : `📋 *${boardName}*\n\nשלום ${a.fullName}!\nנפתח לוח זמינות. כדי לעדכן, קודם צריך להגדיר סיסמה:\n🔑 ${baseUrl}/invite/${a.inviteToken}\n\nאחרי זה תוכל/י לעדכן את הזמינות כאן:\n🔗 ${boardUrl}`;

            const phone = a.phone?.replace(/\D/g, "").replace(/^0/, "972") || "";
            const waUrl = phone
              ? `https://wa.me/${phone}?text=${encodeURIComponent(personalMsg)}`
              : `https://wa.me/?text=${encodeURIComponent(personalMsg)}`;

            return (
              <div key={a.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50">
                <span className="text-sm flex-1">{a.fullName}</span>
                {!registered && (
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">לא רשום</span>
                )}
                {a.phone && (
                  <span className="text-[10px] text-slate-400 font-mono">{a.phone}</span>
                )}
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200"
                >
                  📲
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
