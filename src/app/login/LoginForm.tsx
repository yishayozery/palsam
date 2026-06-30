"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = {};

type BattalionInfo = {
  name: string;
  code: string;
  motto: string | null;
  logoData: string | null;
};

export default function LoginForm({ battalion }: { battalion?: BattalionInfo | null }) {
  const [state, formAction, pending] = useActionState(loginAction, initial);
  const isTotpStep = state.step === "totp";

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: battalion?.logoData
        ? "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)"
        : "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)" }}>

      {battalion && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {battalion.logoData ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={battalion.logoData} alt="" className="w-[500px] h-[500px] object-contain opacity-[0.06]" />
          ) : (
            <span className="text-white/[0.07] text-[140px] font-black select-none leading-none text-center whitespace-nowrap">{battalion.name}</span>
          )}
        </div>
      )}

      <div className="w-full max-w-sm bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl p-8 relative z-10">
        <div className="text-center mb-6">
          {battalion?.logoData ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={battalion.logoData} alt="סמל" className="mx-auto w-16 h-16 object-contain mb-3" />
          ) : (
            <div className="mx-auto w-14 h-14 rounded-xl bg-slate-800 text-white flex items-center justify-center text-2xl mb-3">
              🛡️
            </div>
          )}
          <h1 className="text-2xl font-bold text-slate-800 tracking-wide">
            {battalion?.name ?? "PALSAM"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isTotpStep
              ? "אימות דו-שלבי (2FA)"
              : battalion?.motto
                ? `״${battalion.motto}״`
                : "ניהול שרשרת אספקה, מלאי והחתמות ציוד"}
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          {isTotpStep ? (
            <>
              <input type="hidden" name="pendingUserId" value={state.pendingUserId ?? ""} />
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
                🔐 פתח את אפליקציית Google Authenticator (או Microsoft Authenticator)
                והזן את הקוד בן 6 הספרות שמופיע מולך.
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">קוד 2FA</label>
                <input
                  name="totpToken"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  placeholder="123456"
                  className="w-full rounded-lg border-2 border-slate-300 px-3 py-2 text-center text-2xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">שם משתמש</label>
                <input
                  name="username"
                  autoComplete="username"
                  autoFocus
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">סיסמה</label>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">מספר גדוד / חטיבה</label>
                <input
                  name="battalionCode"
                  inputMode="numeric"
                  defaultValue={battalion?.code ?? ""}
                  placeholder="לדוגמה: 932"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">הקוד שקיבלת מהמפ״מ</p>
              </div>

              {/* 🪤 Honeypot */}
              <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "-9999px" }}>
                <label>אל תמלא:
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                </label>
              </div>
            </>
          )}

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
            {pending ? "מתחבר..." : isTotpStep ? "✓ אמת קוד" : "כניסה למערכת"}
          </button>
        </form>

        {!isTotpStep && (
          <p className="text-xs text-slate-400 text-center mt-6">
            {battalion && <span className="text-slate-300">PALSAM · </span>}
            <a href="/about" className="hover:text-slate-600 underline">מה זה PALSAM?</a>
          </p>
        )}
      </div>
    </div>
  );
}
