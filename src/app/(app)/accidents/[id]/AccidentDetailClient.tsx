"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui";
import BackButton from "@/components/BackButton";
import SignaturePad from "@/components/SignaturePad";
import { saveOfficerNotes, sendToMagad, magadApprove, returnToOfficer, getExaminerLink } from "./actions";

type PartA = {
  accidentAt: string | null; location: string | null; description: string | null;
  ourVehiclePlate: string | null; ourVehicleType: string | null;
  driverName: string | null; driverPersonalId: string | null; driverPhone: string | null;
  otherPartyName: string | null; otherPartyId: string | null; otherPartyPhone: string | null;
  otherVehiclePlate: string | null; otherVehicleUnit: string | null; otherInsurance: string | null;
};

const TYPE_LABEL: Record<string, string> = { ARMY_SELF: "צבא עצמי", ARMY_ARMY: "צבא עם צבא", CIVILIAN: "מעורבות אזרח" };
const PHOTO_LABEL: Record<string, string> = {
  VEHICLE_FRONT: "רכבנו — חזית", VEHICLE_BACK: "רכבנו — אחור", VEHICLE_LEFT: "רכבנו — שמאל", VEHICLE_RIGHT: "רכבנו — ימין",
  SCENE: "זירת התאונה", CIVIL_LICENSE_FRONT: "רישיון אזרחי קדימה", CIVIL_LICENSE_BACK: "רישיון אזרחי אחורה", MILITARY_LICENSE: "רישיון צבאי",
  OTHER_VEHICLE: "רכב הצד השני", OTHER_CIVIL_LICENSE_FRONT: "רישיון (שני) קדימה", OTHER_CIVIL_LICENSE_BACK: "רישיון (שני) אחורה", OTHER_MILITARY_LICENSE: "רישיון צבאי (שני)", OTHER: "אחר",
};
const STEPS = [
  { s: "DRAFT", label: "מילוי חייל" },
  { s: "OFFICER_REVIEW", label: "קצין רכב" },
  { s: "MAGAD_REVIEW", label: 'מג"ד' },
  { s: "EXAMINER_REVIEW", label: "בוחן רכב" },
  { s: "APPROVED", label: "הושלם" },
];

function Row({ label, value }: { label: string; value: string | null }) {
  return value ? <div><span className="text-slate-400">{label}:</span> <span className="font-medium text-slate-700">{value}</span></div> : null;
}

export default function AccidentDetailClient(props: {
  id: string; type: string; status: string; battalionName: string; createdAt: string;
  partA: PartA; photos: { kind: string; url: string }[];
  officerNotes: string; officerName: string | null; officerAt: string | null;
  magadName: string | null; magadSignature: string | null; magadAt: string | null;
  examinerName: string | null; examinerSignature: string | null; examinerAt: string | null;
}) {
  const { id, type, status, partA, photos } = props;
  const router = useRouter();
  const [notes, setNotes] = useState(props.officerNotes);
  const [sig, setSig] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [exLink, setExLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const wa = (link: string) => `https://wa.me/?text=${encodeURIComponent(`אישור תחקיר תאונה — נא לחתום:\n${link}`)}`;
  const stepIdx = STEPS.findIndex((x) => x.s === status);

  const run = (fn: () => Promise<{ ok?: boolean; error?: string }>) => start(async () => {
    setErr(null); setMsg(null);
    const r = await fn();
    if (r.error) setErr(r.error); else { setMsg("נשמר"); router.refresh(); }
  });

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <BackButton />
        <Badge className="bg-slate-100 text-slate-700">{TYPE_LABEL[type] ?? type}</Badge>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1 text-[11px] overflow-x-auto pb-1">
        {STEPS.map((st, i) => (
          <div key={st.s} className="flex items-center gap-1 shrink-0">
            <span className={`rounded-full px-2 py-0.5 ${i < stepIdx ? "bg-emerald-100 text-emerald-700" : i === stepIdx ? "bg-amber-500 text-white font-bold" : "bg-slate-100 text-slate-400"}`}>{st.label}</span>
            {i < STEPS.length - 1 && <span className="text-slate-300">←</span>}
          </div>
        ))}
      </div>

      {/* חלק א */}
      <Card className="p-4">
        <h3 className="font-bold text-slate-800 mb-2">חלק א — דיווח החייל</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <Row label="מועד" value={partA.accidentAt ? new Date(partA.accidentAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }) : null} />
          <Row label="מיקום" value={partA.location} />
          <Row label="רכבנו" value={[partA.ourVehicleType, partA.ourVehiclePlate].filter(Boolean).join(" · ") || null} />
          <Row label="נהג" value={[partA.driverName, partA.driverPersonalId, partA.driverPhone].filter(Boolean).join(" · ") || null} />
          {type !== "ARMY_SELF" && <Row label="צד שני" value={[partA.otherPartyName, partA.otherPartyId, partA.otherPartyPhone, partA.otherVehiclePlate, partA.otherVehicleUnit, partA.otherInsurance].filter(Boolean).join(" · ") || null} />}
        </div>
        {partA.description && <div className="mt-2 text-sm bg-slate-50 rounded-lg p-2 whitespace-pre-wrap">{partA.description}</div>}

        {/* תמונות */}
        {photos.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
            {photos.map((p) => (
              <a key={p.kind} href={p.url} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={PHOTO_LABEL[p.kind] ?? p.kind} className="w-full h-20 object-cover rounded-lg border border-slate-200" />
                <span className="text-[10px] text-slate-500 block text-center truncate">{PHOTO_LABEL[p.kind] ?? p.kind}</span>
              </a>
            ))}
          </div>
        ) : <p className="text-xs text-slate-400 mt-3">אין תמונות שהועלו.</p>}
      </Card>

      {/* חלק ב — קצין רכב */}
      <Card className="p-4">
        <h3 className="font-bold text-slate-800 mb-2">חלק ב — קצין רכב {props.officerName && <span className="text-xs text-slate-400 font-normal">· {props.officerName}</span>}</h3>
        {status === "OFFICER_REVIEW" ? (
          <>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="תחקיר / השלמות קצין הרכב…"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <div className="flex gap-2 mt-2 flex-wrap">
              <button disabled={pending} onClick={() => run(() => saveOfficerNotes(id, notes))} className="bg-slate-200 text-slate-700 rounded-lg px-4 py-2 text-sm disabled:opacity-50">💾 שמור טיוטה</button>
              <button disabled={pending} onClick={() => run(() => sendToMagad(id, notes))} className="bg-violet-600 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">➡️ שלח לאישור מג״ד</button>
            </div>
          </>
        ) : (
          props.officerNotes ? <div className="text-sm bg-slate-50 rounded-lg p-2 whitespace-pre-wrap">{props.officerNotes}</div> : <p className="text-xs text-slate-400">ללא הערות קצין רכב.</p>
        )}
      </Card>

      {/* אישור מג"ד */}
      <Card className="p-4">
        <h3 className="font-bold text-slate-800 mb-2">אישור מג״ד {props.magadName && <span className="text-xs text-slate-400 font-normal">· {props.magadName}</span>}</h3>
        {props.magadSignature ? (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={props.magadSignature} alt="חתימת מגד" className="max-h-24 border border-slate-200 rounded-lg bg-white" />
            <p className="text-[11px] text-slate-400 mt-1">אושר {props.magadAt ? new Date(props.magadAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" }) : ""}</p>
          </div>
        ) : status === "MAGAD_REVIEW" ? (
          <>
            <p className="text-xs text-slate-500 mb-1">חתום לאישור הדיווח:</p>
            <SignaturePad onChange={setSig} />
            <div className="flex gap-2 mt-2 flex-wrap">
              <button disabled={pending || !sig} onClick={() => run(() => magadApprove(id, sig))} className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">✅ אשר וחתום</button>
              <button disabled={pending} onClick={() => run(() => returnToOfficer(id))} className="text-rose-600 text-sm px-3 py-2">↩︎ החזר לקצין רכב</button>
            </div>
          </>
        ) : <p className="text-xs text-slate-400">ממתין לשלב קצין הרכב.</p>}
      </Card>

      {/* בוחן רכב */}
      {(status === "EXAMINER_REVIEW" || status === "APPROVED") && (
        <Card className="p-4">
          <h3 className="font-bold text-slate-800 mb-2">אישור בוחן רכב {props.examinerName && <span className="text-xs text-slate-400 font-normal">· {props.examinerName}</span>}</h3>
          {props.examinerSignature ? (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={props.examinerSignature} alt="חתימת בוחן" className="max-h-24 border border-slate-200 rounded-lg bg-white" />
              <p className="text-[11px] text-slate-400 mt-1">נחתם {props.examinerAt ? new Date(props.examinerAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" }) : ""}</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500 mb-2">שלח את התחקיר לבוחן הרכב לחתימה (וואטסאפ):</p>
              {!exLink ? (
                <button disabled={pending} onClick={() => start(async () => { const r = await getExaminerLink(id); if (r.link) { setExLink(r.link); setCopied(false); } })}
                  className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">🔗 צור לינק לבוחן</button>
              ) : (
                <div className="flex gap-2 flex-wrap items-center">
                  <input readOnly value={exLink} onFocus={(e) => e.target.select()} className="flex-1 min-w-[180px] border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white font-mono" />
                  <button onClick={() => { navigator.clipboard.writeText(exLink); setCopied(true); }} className="bg-slate-700 text-white rounded-lg px-3 py-1.5 text-xs">{copied ? "✓ הועתק" : "העתק"}</button>
                  <a href={wa(exLink)} target="_blank" rel="noreferrer" className="bg-emerald-600 text-white rounded-lg px-3 py-1.5 text-xs">📲 וואטסאפ</a>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* PDF / הדפסה — כשהושלם */}
      {status === "APPROVED" && (
        <a href={`/accidents/${id}/document`} target="_blank" rel="noreferrer"
          className="block text-center bg-slate-800 hover:bg-slate-900 text-white rounded-xl py-3 font-bold">
          📄 תעודה מלאה / הורדת PDF (למצ״ח)
        </a>
      )}

      {err && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{err}</div>}
      {msg && <div className="text-sm text-emerald-700">{msg}</div>}
    </div>
  );
}
