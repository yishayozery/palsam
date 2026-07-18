"use client";

import { useState, useTransition } from "react";
import SignaturePad from "@/components/SignaturePad";
import { signAsExaminer } from "./actions";

export default function ExaminerSignClient(props: {
  id: string; token: string; alreadySigned: boolean; wrongStage: boolean;
  battalionName: string; typeLabel: string;
  eventLine: string; vehicleLine: string; otherLine: string;
  description: string; officerNotes: string;
  magadSignature: string | null; examinerName: string | null; examinerSignature: string | null;
  photos: { label: string; url: string }[];
}) {
  const [name, setName] = useState(props.examinerName ?? "");
  const [sig, setSig] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(props.alreadySigned);
  const [pending, start] = useTransition();

  function submit() {
    setErr(null);
    if (!name.trim()) { setErr("נא למלא שם"); return; }
    if (!sig) { setErr("נא לחתום"); return; }
    start(async () => {
      const r = await signAsExaminer(props.id, props.token, name, sig);
      if (r.error) { setErr(r.error); return; }
      setDone(true);
    });
  }

  if (props.wrongStage && !done) {
    return <div dir="rtl" className="min-h-screen flex items-center justify-center p-6 bg-slate-50" style={{ fontFamily: "system-ui" }}>
      <p className="text-slate-500">הדיווח אינו זמין לחתימה כרגע.</p>
    </div>;
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 pb-8" style={{ fontFamily: "system-ui" }}>
      <div className="max-w-md mx-auto p-3 space-y-3">
        <div className="text-center pt-1">
          <h1 className="text-lg font-bold text-slate-800">🚧 אישור בוחן רכב</h1>
          <p className="text-xs text-slate-500">{props.battalionName} · {props.typeLabel}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3 text-sm space-y-1">
          {props.eventLine && <div className="text-slate-700">{props.eventLine}</div>}
          {props.vehicleLine && <div className="text-slate-700">{props.vehicleLine}</div>}
          {props.otherLine && <div className="text-slate-700">{props.otherLine}</div>}
          {props.description && <div className="bg-slate-50 rounded-lg p-2 whitespace-pre-wrap text-slate-700 mt-1">{props.description}</div>}
          {props.officerNotes && <div className="mt-1"><span className="text-slate-400 text-xs">תחקיר קצין רכב:</span><div className="bg-amber-50 rounded-lg p-2 whitespace-pre-wrap">{props.officerNotes}</div></div>}
        </div>

        {props.photos.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="text-xs font-bold text-slate-500 mb-2">תמונות</div>
            <div className="grid grid-cols-3 gap-2">
              {props.photos.map((p, i) => (
                <a key={i} href={p.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.label} className="w-full h-20 object-cover rounded-lg border border-slate-200" />
                  <span className="text-[10px] text-slate-500 block text-center truncate">{p.label}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {props.magadSignature && (
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-400 mb-1">חתימת מג״ד:</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={props.magadSignature} alt="חתימת מגד" className="max-h-20 border border-slate-200 rounded bg-white" />
          </div>
        )}

        {done ? (
          <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-6 text-center">
            <div className="text-5xl mb-2">✅</div>
            <p className="font-bold text-emerald-800">התחקיר אושר ונחתם</p>
            {props.examinerSignature && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.examinerSignature} alt="חתימת בוחן" className="max-h-20 mx-auto mt-2 border border-slate-200 rounded bg-white" />
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="text-xs font-bold text-slate-500 mb-2">חתימת הבוחן</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם הבוחן"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2" />
            <SignaturePad onChange={setSig} />
            {err && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mt-2">{err}</div>}
            <button onClick={submit} disabled={pending}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 font-bold mt-2 disabled:opacity-50">
              {pending ? "חותם…" : "✅ אשר וחתום"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
