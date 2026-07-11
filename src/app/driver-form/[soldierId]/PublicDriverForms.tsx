"use client";

import { useState, useTransition } from "react";
import SigPadInline from "@/app/(app)/signatures/SigPadInline";
import { FieldInput, fileImage } from "@/app/(app)/driver-files/FormFields";
import { DRIVER_FORMS, FORM_ORDER, FORM_TITLES, prefillValue, type FormType } from "@/lib/driverForms";
import { submitDriverFormPublic, savePublicLicensePhotos } from "./actions";

type Soldier = {
  id: string; fullName: string; firstName: string; lastName: string; personalNumber: string; company: string; role: string;
  civilianLicenseNumber: string; civilianLicenseGrade: string; civilianLicenseExpiry: string;
};
type FormRec = { formType: FormType; data: Record<string, unknown>; filledAt: string | null; validUntil: string | null };
type Photos = { civFront: boolean; civBack: boolean; milFront: boolean };

export default function PublicDriverForms({ soldier, forms, photos, token }: { soldier: Soldier; forms: FormRec[]; photos: Photos; token: string }) {
  const [open, setOpen] = useState<FormType | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  const prefillCtx = {
    lastName: soldier.lastName, firstName: soldier.firstName, fullName: soldier.fullName, personalNumber: soldier.personalNumber,
    company: soldier.company, role: soldier.role, civLicNumber: soldier.civilianLicenseNumber, civLicGrade: soldier.civilianLicenseGrade, civLicExpiry: soldier.civilianLicenseExpiry,
  };
  const [now] = useState(() => Date.now());
  const statusOf = (r: FormRec) => {
    if (!r.filledAt) return { icon: "⚪", cls: "text-slate-400", label: "טרם מולא" };
    if (r.validUntil && new Date(r.validUntil).getTime() < now) return { icon: "🔴", cls: "text-rose-600", label: "פג — יש למלא שוב" };
    return { icon: "🟢", cls: "text-emerald-600", label: "מולא ✓" };
  };

  if (doneMsg) {
    return (
      <div className="text-center py-8">
        <div className="text-5xl mb-3">✅</div>
        <p className="font-bold text-emerald-700">{doneMsg}</p>
        <button onClick={() => setDoneMsg(null)} className="mt-4 text-sm text-indigo-600 hover:underline">חזרה לטפסים</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 text-center mb-2">מלא/י וחתום/י על הטפסים ושלח/י צילומי רישיון.</p>

      {/* הנחיה למצלמה — הדפדפן הפנימי של טלגרם חוסם מצלמה */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 leading-relaxed">
        📸 <b>המצלמה נפתחת שחורה?</b> זו מגבלה של הדפדפן הפנימי של טלגרם.
        לחצו על <b>⋮</b> (שלוש נקודות למעלה) ◄ <b>&quot;פתח בדפדפן&quot;</b> / &quot;Open in Browser&quot;, ושם הצילום יעבוד תקין.
        <div className="mt-1 text-amber-700">אפשר גם לבחור &quot;גלריה&quot; ולצלם קודם עם אפליקציית המצלמה.</div>
      </div>

      {/* צילומי רישיון */}
      <div className="border border-slate-200 rounded-xl p-3">
        <div className="text-sm font-medium text-slate-800 mb-2">🪪 צילומי רישיון</div>
        <div className="grid grid-cols-3 gap-2">
          <PhotoSlot label="אזרחי — קדימה" soldierId={soldier.id} token={token} field="civFront" had={photos.civFront} />
          <PhotoSlot label="אזרחי — אחורה" soldierId={soldier.id} token={token} field="civBack" had={photos.civBack} />
          <PhotoSlot label="צבאי — קדימה" soldierId={soldier.id} token={token} field="milFront" had={photos.milFront} />
        </div>
      </div>

      {forms.map((rec) => {
        const st = statusOf(rec);
        return (
          <div key={rec.formType} className="border border-slate-200 rounded-xl overflow-hidden">
            <button onClick={() => setOpen(open === rec.formType ? null : rec.formType)}
              className="w-full flex items-center justify-between p-3 hover:bg-slate-50 text-right">
              <span className="font-medium text-slate-800 text-sm">{FORM_TITLES[rec.formType]}</span>
              <span className={`text-sm ${st.cls}`}>{st.icon} {st.label}</span>
            </button>
            {open === rec.formType && (
              <PublicFiller formType={rec.formType} rec={rec} soldier={soldier} token={token} prefillCtx={prefillCtx}
                onSaved={() => { setOpen(null); setDoneMsg("הטופס נשלח בהצלחה! תודה."); }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PublicFiller({
  formType, rec, soldier, token, prefillCtx, onSaved,
}: {
  formType: FormType; rec: FormRec; soldier: Soldier; token: string;
  prefillCtx: Parameters<typeof prefillValue>[1]; onSaved: () => void;
}) {
  const def = DRIVER_FORMS[formType];
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = { ...rec.data };
    for (const sec of def.sections) for (const f of sec.fields) {
      if (init[f.key] == null && f.prefill) { const v = prefillValue(f.prefill, prefillCtx); if (v) init[f.key] = v; }
    }
    return init;
  });
  const [sig, setSig] = useState("");
  const setVal = (k: string, v: unknown) => setValues((p) => ({ ...p, [k]: v }));
  const setGrid = (k: string, row: string, col: string, v: string) =>
    setValues((p) => { const g = { ...((p[k] as Record<string, Record<string, string>>) ?? {}) }; g[row] = { ...(g[row] ?? {}), [col]: v }; return { ...p, [k]: g }; });

  function submit() {
    setErr(null);
    const license = formType === "SAFETY_TRACKING"
      ? { number: values.licenseNumber as string, grade: values.licenseGrade as string, expiry: values.licenseExpiry as string }
      : undefined;
    start(async () => {
      const r = await submitDriverFormPublic(soldier.id, token, formType, values, { signatureData: sig, signerName: soldier.fullName, signerPersonalNumber: soldier.personalNumber }, license);
      if (r.error) { setErr(r.error); return; }
      onSaved();
    });
  }

  return (
    <div className="p-3 border-t border-slate-100 space-y-3 bg-slate-50/40">
      {def.declaration && (
        <ol className="text-xs text-slate-600 space-y-1 list-decimal pr-4 bg-white rounded-lg p-3 border border-slate-100">
          {def.declaration.map((c, i) => <li key={i}>{c}</li>)}
        </ol>
      )}
      {def.sections.map((sec) => (
        <div key={sec.title}>
          <div className="text-sm font-bold text-slate-700 mb-1">{sec.title}</div>
          {sec.note && <div className="text-[11px] text-slate-400 mb-1">{sec.note}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sec.fields.map((f) => <FieldInput key={f.key} f={f} values={values} setVal={setVal} setGrid={setGrid} />)}
          </div>
        </div>
      ))}
      <SigPadInline label="חתימת הנהג" onChange={setSig} />
      {err && <p className="text-rose-600 text-sm text-center">{err}</p>}
      <button onClick={submit} disabled={pending}
        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl py-3 font-bold">
        {pending ? "שולח…" : "📤 שלח טופס"}
      </button>
    </div>
  );
}

function PhotoSlot({ label, soldierId, token, field, had }: { label: string; soldierId: string; token: string; field: "civFront" | "civBack" | "milFront"; had: boolean }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [saved, setSaved] = useState(had);
  const [pending, start] = useTransition();
  async function onFile(f: File) {
    const data = await fileImage(f, 1100, 0.6);
    setPreview(data);
    start(async () => { await savePublicLicensePhotos(soldierId, token, { [field]: data }); setSaved(true); });
  }
  return (
    <label className="cursor-pointer border-2 border-dashed rounded-lg p-2 text-center flex flex-col items-center justify-center gap-1 min-h-[84px] hover:bg-slate-50 border-slate-300">
      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="h-12 w-full object-cover rounded" />
      ) : (
        <span className="text-lg">{saved ? "✅" : "📷"}</span>
      )}
      <span className="text-[10px] text-slate-600 leading-tight">{label}</span>
      {pending && <span className="text-[9px] text-indigo-500">שומר…</span>}
      {saved && !pending && !preview && <span className="text-[9px] text-emerald-600">הועלה</span>}
    </label>
  );
}
