"use client";

import { useState } from "react";
import { resetUserInvite } from "./actions";

export default function UserActions({ userId, fullName, phone, baseUrl }: {
  userId: string; fullName: string; phone: string | null; baseUrl: string;
}) {
  const [busy, setBusy] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function doReset() {
    if (busy) return;
    if (!confirm(`לשחזר את הסיסמה של ${fullName}? המשתמש יידרש להגדיר סיסמה חדשה.`)) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("userId", userId);
      const res = await resetUserInvite(fd);
      if (res?.inviteToken) setNewToken(res.inviteToken);
      else if (res?.error) alert(res.error);
    } finally { setBusy(false); }
  }

  const link = newToken ? `${baseUrl}/invite/${newToken}` : null;
  const wa = link && phone
    ? `https://wa.me/${phone.replace(/\D/g, "").replace(/^0/, "972")}?text=${encodeURIComponent(`קישור לשחזור סיסמה במערכת PALSAM: ${link}`)}`
    : null;

  if (newToken && link) {
    return (
      <div className="absolute top-full mt-1 left-0 z-20 bg-white border-2 border-blue-300 rounded-lg shadow-xl p-3 w-72">
        <div className="text-xs font-bold text-blue-800 mb-2">🔄 קישור איפוס סיסמה לשליחה למשתמש</div>
        <div className="text-[10px] break-all bg-slate-50 rounded p-1.5 font-mono mb-2">{link}</div>
        <div className="flex gap-1.5">
          <button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="flex-1 text-xs bg-slate-100 hover:bg-slate-200 rounded px-2 py-1">
            {copied ? "✓ הועתק" : "📋 העתק"}
          </button>
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="flex-1 text-xs bg-emerald-500 text-white text-center rounded px-2 py-1 hover:bg-emerald-600">
              💬 וואטסאפ
            </a>
          )}
          <button onClick={() => setNewToken(null)} className="text-xs text-slate-400 hover:text-slate-700 px-1.5">✕</button>
        </div>
      </div>
    );
  }

  return (
    <button onClick={doReset} disabled={busy}
      className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded px-2 py-1 disabled:opacity-50"
      title="שחזור סיסמה למשתמש">
      🔄 {busy ? "..." : "שחזור סיסמה"}
    </button>
  );
}
