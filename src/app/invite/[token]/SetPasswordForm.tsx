"use client";

import { useActionState } from "react";
import { activateAccount, type InviteState } from "./actions";

const initial: InviteState = {};

export default function SetPasswordForm({ token, username }: { token: string; username: string }) {
  const [state, formAction, pending] = useActionState(activateAccount, initial);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">שם משתמש</label>
        <input value={username} disabled className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono text-slate-400" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">סיסמה חדשה</label>
        <input type="password" name="password" autoFocus minLength={12}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">אימות סיסמה</label>
        <input type="password" name="confirm" minLength={12}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-500" />
      </div>
      <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 space-y-1">
        <div className="font-medium text-slate-600 mb-1">דרישות סיסמה:</div>
        <div>12 תווים לפחות</div>
        <div>אות גדולה באנגלית (A-Z)</div>
        <div>אות קטנה באנגלית (a-z)</div>
        <div>ספרה (0-9)</div>
        <div>תו מיוחד (!@#$%...)</div>
      </div>
      {state.error && <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{state.error}</p>}
      {/* 📜 הסכמה לתנאים — נאכפת גם בשרת ב-activateAccount */}
      <label className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
        <input type="checkbox" name="acceptTerms" required className="mt-0.5 w-4 h-4 accent-slate-800 shrink-0" />
        <span>
          קראתי ואני מאשר/ת את{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
            תנאי השימוש ומדיניות הפרטיות
          </a>
          .
        </span>
      </label>

      <button type="submit" disabled={pending}
        className="w-full bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white rounded-lg py-2.5 font-medium transition">
        {pending ? "מפעיל..." : "הפעלת חשבון וכניסה"}
      </button>
    </form>
  );
}
