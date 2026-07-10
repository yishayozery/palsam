"use client";

import { useState, useTransition } from "react";
import SigPadInline from "@/app/(app)/signatures/SigPadInline";
import { signWeaponsAgreement } from "./actions";

export default function SignForm({ soldierId, token, fullName, personalNumber, clauses, footer }: {
  soldierId: string;
  token: string;
  fullName: string;
  personalNumber: string;
  clauses: string[];
  footer: string;
}) {
  const [name, setName] = useState(fullName);
  const [pn, setPn] = useState(personalNumber);
  const [sig, setSig] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    if (!name.trim()) { setError("נא למלא שם מלא"); return; }
    if (!pn.replace(/\D/g, "")) { setError("נא למלא מספר אישי"); return; }
    if (!sig) { setError("נא לחתום בתיבה"); return; }
    start(async () => {
      const res = await signWeaponsAgreement(soldierId, token, name, pn, sig);
      if (res.error) { setError(res.error); return; }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="text-center py-8">
        <div className="text-5xl mb-2">✅</div>
        <p className="font-bold text-emerald-700 text-lg">החתימה נקלטה בהצלחה!</p>
        <p className="text-sm text-slate-500 mt-1">תודה, {name}. נוהל שמירת הנשק נחתם.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* נוסח הנוהל */}
      <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 max-h-56 overflow-y-auto text-sm text-slate-700 leading-relaxed">
        <ol className="list-decimal pr-5 space-y-1.5">
          {clauses.map((c, i) => <li key={i}>{c}</li>)}
        </ol>
        {footer && <p className="mt-3 text-xs text-slate-500 whitespace-pre-wrap">{footer}</p>}
      </div>

      {/* שם + מ.א */}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-600">שם מלא
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-xs text-slate-600">מספר אישי
          <input value={pn} onChange={(e) => setPn(e.target.value)} inputMode="numeric"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
        </label>
      </div>

      {/* חתימה */}
      <SigPadInline onChange={setSig} label="חתימת החייל" />

      {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

      <button onClick={submit} disabled={pending}
        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-bold">
        {pending ? "שומר…" : "✍️ חתום על הנוהל"}
      </button>
      <p className="text-[11px] text-slate-400 text-center">בחתימתך אתה מאשר שקראת והבנת את נוהל שמירת הנשק.</p>
    </div>
  );
}
