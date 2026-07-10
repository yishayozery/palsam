"use client";

import { useState, useTransition } from "react";
import SignaturePad from "@/components/SignaturePad";
import { signFuelCardPublic } from "./actions";

export default function SignForm({ cardId, token, soldierName }: { cardId: string; token: string; soldierName: string }) {
  const [sig, setSig] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  if (done) return <div className="text-center py-6"><div className="text-5xl mb-2">✅</div><p className="font-bold text-emerald-700">נחתם בהצלחה. תודה, {soldierName}!</p></div>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 text-center">אני מאשר/ת קבלת הכרטיס באחריותי — חתום/י בתיבה:</p>
      <SignaturePad onChange={setSig} height={180} />
      {err && <p className="text-rose-600 text-sm text-center">{err}</p>}
      <button
        onClick={() => { setErr(null); if (!sig) { setErr("נא לחתום"); return; } start(async () => { const r = await signFuelCardPublic(cardId, token, sig); if (r.error) { setErr(r.error); return; } setDone(true); }); }}
        disabled={pending}
        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl py-3 font-bold">
        {pending ? "שולח…" : "✍️ אשר וחתום"}
      </button>
    </div>
  );
}
