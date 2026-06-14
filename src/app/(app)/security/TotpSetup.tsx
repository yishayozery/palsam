"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { startTotpSetup, confirmTotpSetup, disableTotp } from "../profile/totp-actions";

export default function TotpSetup({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [disableMode, setDisableMode] = useState(false);

  async function start() {
    setBusy(true); setError(null); setSuccess(null);
    try {
      const res = await startTotpSetup();
      if (res.error || !res.secret || !res.qrDataUrl) {
        setError(res.error ?? "שגיאה");
      } else {
        setSetup({ secret: res.secret, qrDataUrl: res.qrDataUrl });
      }
    } finally { setBusy(false); }
  }

  async function confirm() {
    if (!setup) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("secret", setup.secret);
      fd.append("token", code);
      const res = await confirmTotpSetup(fd);
      if (res.error) setError(res.error);
      else {
        setSuccess("✓ 2FA הופעל בהצלחה! בכניסה הבאה תתבקש להזין קוד מהאפליקציה.");
        setSetup(null); setCode("");
        router.refresh();
      }
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("token", code);
      const res = await disableTotp(fd);
      if (res.error) setError(res.error);
      else {
        setSuccess("✓ 2FA בוטל. החשבון מוגן רק בסיסמה כעת.");
        setDisableMode(false); setCode("");
        router.refresh();
      }
    } finally { setBusy(false); }
  }

  if (success) {
    return (
      <Card className="p-5 bg-emerald-50 border-emerald-300">
        <p className="text-emerald-800 font-medium">{success}</p>
      </Card>
    );
  }

  // מסך ביטול
  if (enabled && disableMode) {
    return (
      <Card className="p-5 border-rose-300">
        <h3 className="font-bold text-rose-700 mb-2">⚠️ ביטול 2FA</h3>
        <p className="text-sm text-slate-600 mb-3">
          להוכחת זהותך הזן את הקוד מהאפליקציה. אחרי ביטול — החשבון יישאר מוגן רק בסיסמה.
        </p>
        <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric" maxLength={6} placeholder="123456"
          className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-center text-xl font-mono mb-3" />
        {error && <p className="text-sm text-rose-600 mb-2">{error}</p>}
        <div className="flex gap-2">
          <button onClick={disable} disabled={busy || code.length !== 6}
            className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm">
            ✕ בטל 2FA
          </button>
          <button onClick={() => { setDisableMode(false); setCode(""); setError(null); }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm">חזור</button>
        </div>
      </Card>
    );
  }

  // 2FA פעיל
  if (enabled) {
    return (
      <Card className="p-5">
        <p className="text-sm text-slate-600 mb-3">
          2FA פעיל בחשבונך. אם איבדת גישה לטלפון, צור קשר עם אדמין-על להפעלת אופציות שחזור.
        </p>
        <button onClick={() => setDisableMode(true)}
          className="rounded-lg border border-rose-300 text-rose-600 hover:bg-rose-50 px-4 py-2 text-sm">
          ⚠️ בטל 2FA
        </button>
      </Card>
    );
  }

  // מסך הגדרה
  if (setup) {
    return (
      <Card className="p-5">
        <h3 className="font-bold text-slate-800 mb-3">סרוק את ה-QR Code</h3>
        <ol className="text-sm text-slate-700 mb-4 space-y-2 list-decimal list-inside">
          <li>הורד את <b>Google Authenticator</b> או <b>Microsoft Authenticator</b> מחנות האפליקציות.</li>
          <li>פתח את האפליקציה ובחר &quot;הוסף חשבון&quot;.</li>
          <li>סרוק את ה-QR למטה <b>או</b> הזן ידנית את ה-secret.</li>
          <li>הקלד את הקוד בן 6 הספרות שמופיע באפליקציה.</li>
        </ol>
        <div className="bg-white border-2 border-slate-200 rounded-xl p-4 mb-3 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qrDataUrl} alt="QR Code 2FA" className="w-60 h-60" />
        </div>
        <details className="text-xs text-slate-500 mb-3">
          <summary className="cursor-pointer">או הזן ידנית במקום לסרוק</summary>
          <code className="block mt-2 bg-slate-100 rounded p-2 font-mono break-all">{setup.secret}</code>
        </details>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
          <label className="block text-xs font-semibold text-blue-900 mb-1">הזן את הקוד מהאפליקציה:</label>
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric" maxLength={6} placeholder="123456" autoFocus
            className="w-40 rounded-lg border-2 border-blue-300 px-3 py-2 text-center text-2xl font-mono tracking-widest" />
        </div>
        {error && <p className="text-sm text-rose-600 mb-2">{error}</p>}
        <div className="flex gap-2">
          <button onClick={confirm} disabled={busy || code.length !== 6}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium">
            ✓ אשר והפעל 2FA
          </button>
          <button onClick={() => { setSetup(null); setCode(""); setError(null); }} disabled={busy}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
        </div>
      </Card>
    );
  }

  // התחלה
  return (
    <Card className="p-5">
      {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
      <button onClick={start} disabled={busy}
        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-5 py-2.5 text-sm font-medium">
        {busy ? "טוען..." : "🔐 הפעל 2FA עכשיו"}
      </button>
    </Card>
  );
}
