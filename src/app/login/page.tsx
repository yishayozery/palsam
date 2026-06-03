"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-6">
          <div className="mx-auto w-14 h-14 rounded-xl bg-slate-800 text-white flex items-center justify-center text-2xl mb-3">
            🛡️
          </div>
          <h1 className="text-xl font-bold text-slate-800">ניהול מלאי גדודי</h1>
          <p className="text-sm text-slate-500 mt-1">
            שרשרת אספקה, מלאי והחתמות ציוד
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              שם משתמש
            </label>
            <input
              name="username"
              autoComplete="username"
              autoFocus
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              סיסמה
            </label>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </div>

          {state.error && (
            <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white rounded-lg py-2.5 font-medium transition"
          >
            {pending ? "מתחבר..." : "כניסה למערכת"}
          </button>
        </form>

        <p className="text-xs text-slate-400 text-center mt-6">
          דמו: admin / 123456
        </p>
      </div>
    </div>
  );
}
