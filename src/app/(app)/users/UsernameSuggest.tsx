"use client";

import { useEffect, useState } from "react";

export default function UsernameSuggest({
  brigade,
  code,
}: {
  brigade: string;
  code: string;
}) {
  const [base, setBase] = useState("");
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  // הצעה: <base>.<brigade>.<code>
  const parts = [brigade, code].filter(Boolean).map((s) => s.toLowerCase().replace(/\s+/g, ""));
  const suggested = base ? [base.trim().replace(/\s+/g, "_"), ...parts].join(".") : "";

  useEffect(() => {
    if (!suggested) { setAvailable(null); return; }
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/users/check-username?u=${encodeURIComponent(suggested)}`);
        const j = await r.json();
        setAvailable(j.available);
      } finally { setChecking(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [suggested]);

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-slate-500 mb-1">בסיס שם משתמש</label>
          <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="kalag"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">שם משתמש סופי</label>
          <input name="username" value={suggested} readOnly required
            className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-mono" />
        </div>
      </div>
      {base && (
        <p className={`text-xs mt-1 ${available === false ? "text-rose-600" : available ? "text-emerald-600" : "text-slate-500"}`}>
          {checking ? "בודק זמינות..." : available === true ? `✓ ${suggested} פנוי` : available === false ? `✗ ${suggested} תפוס — תוסיף משהו לבסיס` : `הצעה: ${suggested}`}
        </p>
      )}
      <p className="text-[11px] text-slate-400 mt-0.5">
        השם משורשר אוטומטית עם חטיבה ({brigade || "—"}) וקוד הגדוד ({code || "—"}). אם תפוס — שנה את הבסיס.
      </p>
    </div>
  );
}
