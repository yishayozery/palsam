"use client";

import { useState, useRef, useEffect, useCallback, useTransition } from "react";
import { saveAccidentPartA, uploadAccidentPhotoAction, submitAccidentPartA } from "./actions";

type Type = "ARMY_SELF" | "ARMY_ARMY" | "CIVILIAN";
type Fields = {
  accidentAt: string; location: string; description: string;
  ourVehiclePlate: string; ourVehicleType: string;
  driverName: string; driverPersonalId: string; driverPhone: string;
  otherPartyName: string; otherPartyId: string; otherPartyPhone: string;
  otherVehiclePlate: string; otherVehicleUnit: string; otherInsurance: string;
};

const TYPE_LABEL: Record<Type, string> = {
  ARMY_SELF: "צבא עצמי (רכב צבאי בודד)",
  ARMY_ARMY: "צבא עם צבא",
  CIVILIAN: "מעורבות אזרח",
};

const OUR_PHOTOS = [
  { kind: "VEHICLE_FRONT", label: "רכבנו — חזית" },
  { kind: "VEHICLE_BACK", label: "רכבנו — אחור" },
  { kind: "VEHICLE_LEFT", label: "רכבנו — צד שמאל" },
  { kind: "VEHICLE_RIGHT", label: "רכבנו — צד ימין" },
  { kind: "SCENE", label: "זירת התאונה" },
  { kind: "CIVIL_LICENSE_FRONT", label: "רישיון אזרחי — קדימה" },
  { kind: "CIVIL_LICENSE_BACK", label: "רישיון אזרחי — אחורה" },
  { kind: "MILITARY_LICENSE", label: "רישיון צבאי" },
];
const OTHER_ARMY_PHOTOS = [
  { kind: "OTHER_VEHICLE", label: "רכב הפוגע" },
  { kind: "OTHER_CIVIL_LICENSE_FRONT", label: "רישיון אזרחי (פוגע) — קדימה" },
  { kind: "OTHER_CIVIL_LICENSE_BACK", label: "רישיון אזרחי (פוגע) — אחורה" },
  { kind: "OTHER_MILITARY_LICENSE", label: "רישיון צבאי (פוגע)" },
];
const OTHER_CIVIL_PHOTOS = [
  { kind: "OTHER_VEHICLE", label: "רכב האזרח" },
  { kind: "OTHER_CIVIL_LICENSE_FRONT", label: "רישיון האזרח — קדימה" },
  { kind: "OTHER_CIVIL_LICENSE_BACK", label: "רישיון האזרח — אחורה" },
];

function PhotoSlot({ label, url, busy, onFile }: { label: string; url?: string; busy: boolean; onFile: (f: File) => void }) {
  return (
    <label className="block border-2 border-dashed border-slate-300 rounded-xl p-2 text-center cursor-pointer hover:bg-slate-50 bg-white">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={label} className="w-full h-24 object-cover rounded-lg mb-1" />
      ) : (
        <div className="h-24 flex items-center justify-center text-3xl text-slate-300">{busy ? "⏳" : "📷"}</div>
      )}
      <span className="text-[11px] text-slate-600 leading-tight block">{url ? "✅ " : ""}{label}</span>
      <input type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const file = e.target.files?.[0]; if (file) onFile(file); e.target.value = ""; }} />
    </label>
  );
}

function FieldRow({ label, value, onChange, type = "text", ph }: { label: string; value: string; onChange: (v: string) => void; type?: string; ph?: string }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <input type={type} value={value} placeholder={ph} onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
    </label>
  );
}

export default function AccidentFormClient({
  id, token, type, done: initialDone, battalionName, initial, photos: initialPhotos,
}: {
  id: string; token: string; type: Type; done: boolean; battalionName: string;
  initial: Fields; photos: Record<string, string>;
}) {
  const [f, setF] = useState<Fields>(initial);
  const [photos, setPhotos] = useState<Record<string, string>>(initialPhotos);
  const [uploading, setUploading] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(initialDone);
  const [pending, start] = useTransition();
  const skip = useRef(true);

  const set = (k: keyof Fields, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (skip.current) { skip.current = false; return; }
    if (done) return;
    const h = setTimeout(async () => {
      const r = await saveAccidentPartA(id, token, f);
      if (!r.error) setSavedAt(new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }));
    }, 1000);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f]);

  const upload = useCallback(async (kind: string, file: File) => {
    setErr(null); setUploading(kind);
    const fd = new FormData(); fd.set("file", file);
    const r = await uploadAccidentPhotoAction(id, token, kind as never, fd);
    if (r.error) setErr(r.error);
    else if (r.url) setPhotos((p) => ({ ...p, [kind]: r.url! }));
    setUploading(null);
  }, [id, token]);

  const otherPhotos = type === "ARMY_ARMY" ? OTHER_ARMY_PHOTOS : type === "CIVILIAN" ? OTHER_CIVIL_PHOTOS : [];
  const showOtherParty = type !== "ARMY_SELF";

  function submit() {
    setErr(null);
    const missing = ["VEHICLE_FRONT", "VEHICLE_BACK", "VEHICLE_LEFT", "VEHICLE_RIGHT", "SCENE"].filter((k) => !photos[k]);
    if (!f.location.trim()) { setErr("חסר מיקום התאונה"); return; }
    if (missing.length) { setErr("חסרות תמונות חובה: 4 צדדי הרכב + זירה"); return; }
    start(async () => {
      const r = await submitAccidentPartA(id, token);
      if (r.error) { setErr(r.error); return; }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div dir="rtl" className="min-h-screen bg-amber-50 flex items-center justify-center p-6" style={{ fontFamily: "system-ui" }}>
        <div className="text-center">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-slate-800">הדיווח נשלח לקצין הרכב</h1>
          <p className="text-sm text-slate-500 mt-2">תודה. חלק א הושלם והועבר לטיפול.</p>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-amber-50 pb-28" style={{ fontFamily: "system-ui" }}>
      <div className="max-w-md mx-auto p-3 space-y-3">
        <div className="text-center pt-1">
          <h1 className="text-lg font-bold text-slate-800">🚧 דיווח תאונה — חלק א</h1>
          <p className="text-xs text-slate-500">{battalionName} · {TYPE_LABEL[type]}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
          <div className="text-xs font-bold text-slate-500">פרטי האירוע</div>
          <FieldRow label="מועד התאונה" type="datetime-local" value={f.accidentAt} onChange={(v) => set("accidentAt", v)} />
          <FieldRow label="מיקום *" ph="כתובת / ציר / נ.צ" value={f.location} onChange={(v) => set("location", v)} />
          <label className="block text-sm">
            <span className="text-slate-600">תיאור התאונה</span>
            <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={3}
              className="mt-0.5 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
          </label>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
          <div className="text-xs font-bold text-slate-500">רכבנו והנהג</div>
          <div className="grid grid-cols-2 gap-2">
            <FieldRow label="מספר רכב" value={f.ourVehiclePlate} onChange={(v) => set("ourVehiclePlate", v)} />
            <FieldRow label="סוג רכב" value={f.ourVehicleType} onChange={(v) => set("ourVehicleType", v)} />
            <FieldRow label="שם הנהג" value={f.driverName} onChange={(v) => set("driverName", v)} />
            <FieldRow label='מ"א' value={f.driverPersonalId} onChange={(v) => set("driverPersonalId", v)} />
            <FieldRow label="טלפון" type="tel" value={f.driverPhone} onChange={(v) => set("driverPhone", v)} />
          </div>
        </div>

        {showOtherParty && (
          <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
            <div className="text-xs font-bold text-slate-500">{type === "ARMY_ARMY" ? "הרכב הפוגע (צבאי)" : "הצד האזרחי"}</div>
            <div className="grid grid-cols-2 gap-2">
              <FieldRow label="שם" value={f.otherPartyName} onChange={(v) => set("otherPartyName", v)} />
              <FieldRow label={type === "ARMY_ARMY" ? 'מ"א' : 'ת"ז'} value={f.otherPartyId} onChange={(v) => set("otherPartyId", v)} />
              <FieldRow label="טלפון" type="tel" value={f.otherPartyPhone} onChange={(v) => set("otherPartyPhone", v)} />
              <FieldRow label="מספר רכב" value={f.otherVehiclePlate} onChange={(v) => set("otherVehiclePlate", v)} />
              {type === "ARMY_ARMY"
                ? <FieldRow label="יחידה" value={f.otherVehicleUnit} onChange={(v) => set("otherVehicleUnit", v)} />
                : <FieldRow label="חב' ביטוח" value={f.otherInsurance} onChange={(v) => set("otherInsurance", v)} />}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="text-xs font-bold text-slate-500 mb-2">תמונות רכבנו + מסמכים</div>
          <div className="grid grid-cols-3 gap-2">
            {OUR_PHOTOS.map((p) => <PhotoSlot key={p.kind} label={p.label} url={photos[p.kind]} busy={uploading === p.kind} onFile={(file) => upload(p.kind, file)} />)}
          </div>
          {otherPhotos.length > 0 && (
            <>
              <div className="text-xs font-bold text-slate-500 mt-3 mb-2">תמונות הצד השני</div>
              <div className="grid grid-cols-3 gap-2">
                {otherPhotos.map((p) => <PhotoSlot key={p.kind} label={p.label} url={photos[p.kind]} busy={uploading === p.kind} onFile={(file) => upload(p.kind, file)} />)}
              </div>
            </>
          )}
        </div>

        {err && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{err}</div>}
      </div>

      <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto p-3 bg-amber-50 border-t border-amber-200">
        <button onClick={submit} disabled={pending}
          className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded-xl py-3 font-bold disabled:opacity-50">
          {pending ? "שולח…" : "🚧 שלח לקצין הרכב"}
        </button>
        <p className="text-[11px] text-center mt-1 text-slate-400">
          {savedAt ? `💾 נשמר אוטומטית (${savedAt})` : "💾 נשמר אוטומטית בכל שינוי"}
        </p>
      </div>
    </div>
  );
}
