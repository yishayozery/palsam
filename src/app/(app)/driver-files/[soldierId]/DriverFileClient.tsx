"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import SigPadInline from "@/app/(app)/signatures/SigPadInline";
import { DRIVER_FORMS, FORM_ORDER, FORM_TITLES, prefillValue, type FormType, type FieldDef } from "@/lib/driverForms";
import { saveDriverForm, saveLicenseDetails, removeLicensePhoto, sendDriverFormsLink } from "../actions";
import { FieldInput, fileImage } from "../FormFields";

type Soldier = {
  id: string; fullName: string; firstName: string; lastName: string; personalNumber: string; company: string; role: string;
  civilianLicenseNumber: string; civilianLicenseGrade: string; civilianLicenseExpiry: string; hasPhoto: boolean; licensePhotoData: string | null;
};
type FormRec = {
  formType: FormType; data: Record<string, unknown>; signatureData: string | null; signerName: string | null; signerPersonalNumber: string | null;
  filledAt: string | null; validUntil: string | null; validityDays: number;
};

export default function DriverFileClient({
  soldier, forms, battalion,
}: {
  soldier: Soldier;
  forms: FormRec[];
  battalion: { name: string; logoData: string | null };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<FormType | null>(null);

  const prefillCtx = {
    lastName: soldier.lastName, firstName: soldier.firstName, fullName: soldier.fullName, personalNumber: soldier.personalNumber,
    company: soldier.company, role: soldier.role, civLicNumber: soldier.civilianLicenseNumber, civLicGrade: soldier.civilianLicenseGrade, civLicExpiry: soldier.civilianLicenseExpiry,
  };

  const now = Date.now(), monthMs = 30 * 86400000;
  const statusOf = (rec?: FormRec) => {
    if (!rec?.filledAt) return { icon: "⚪", label: "חסר", cls: "text-slate-400" };
    if (!rec.validUntil) return { icon: "🟢", label: "תקין (קבוע)", cls: "text-emerald-600" };
    const t = new Date(rec.validUntil).getTime();
    if (t < now) return { icon: "🔴", label: "פג תוקף", cls: "text-rose-600" };
    if (t - now < monthMs) return { icon: "🟡", label: "פג בקרוב", cls: "text-amber-600" };
    return { icon: "🟢", label: "תקין", cls: "text-emerald-600" };
  };

  const recOf = (ft: FormType) => forms.find((f) => f.formType === ft);

  const [botMsg, setBotMsg] = useState<string | null>(null);
  function sendToBot() {
    setBotMsg(null);
    start(async () => { const r = await sendDriverFormsLink(soldier.id); setBotMsg(r.error ? "⚠️ " + r.error : "✅ נשלח לנהג בבוט"); });
  }

  return (
    <div className="space-y-4">
      {/* שליחה לנהג בבוט */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={sendToBot} disabled={pending} className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2 disabled:opacity-50">
          📲 שלח טפסים לנהג בבוט
        </button>
        {botMsg && <span className="text-sm text-slate-600">{botMsg}</span>}
        <span className="text-xs text-slate-400">הנהג ימלא ויחתום מהטלפון; התיק יתעדכן אוטומטית.</span>
      </div>

      {/* קובץ 4 — פרטי רישיון + צילום */}
      <LicenseCard soldier={soldier} pending={pending} start={start} router={router} />

      {/* 3 טפסים */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {FORM_ORDER.map((ft) => {
          const rec = recOf(ft);
          const st = statusOf(rec);
          return (
            <Card key={ft} className="p-4 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-slate-800 text-sm">{FORM_TITLES[ft]}</h3>
                <span className={`text-lg ${st.cls}`} title={st.label}>{st.icon}</span>
              </div>
              <div className="text-xs text-slate-500 mt-1 flex-1">
                {rec?.filledAt ? (
                  <>
                    <div>מולא: {new Date(rec.filledAt).toLocaleDateString("he-IL")}</div>
                    {rec.validUntil && <div>בתוקף עד: {new Date(rec.validUntil).toLocaleDateString("he-IL")}</div>}
                    {rec.signerName && <div>חתם: {rec.signerName}{rec.signerPersonalNumber ? ` (${rec.signerPersonalNumber})` : ""}</div>}
                  </>
                ) : <div className="text-slate-400">טרם מולא · תוקף {rec?.validityDays ?? 365} ימים</div>}
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setEditing(ft)} className="flex-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-1.5">
                  {rec?.filledAt ? "✏️ ערוך" : "📝 מלא"}
                </button>
                {rec?.filledAt && (
                  <button onClick={() => printForm(ft, rec, soldier, battalion)} className="text-xs border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50">🖨️</button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {editing && (
        <FormFiller
          formType={editing}
          rec={recOf(editing)}
          soldier={soldier}
          prefillCtx={prefillCtx}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

// ============ כרטיס רישיון + צילום (קובץ 4) ============
function LicenseCard({ soldier, pending, start, router }: { soldier: Soldier; pending: boolean; start: React.TransitionStartFunction; router: ReturnType<typeof useRouter> }) {
  const [num, setNum] = useState(soldier.civilianLicenseNumber);
  const [grade, setGrade] = useState(soldier.civilianLicenseGrade);
  const [expiry, setExpiry] = useState(soldier.civilianLicenseExpiry);
  const [photo, setPhoto] = useState<string | null>(soldier.licensePhotoData);
  const [msg, setMsg] = useState<string | null>(null);

  const expT = expiry ? new Date(expiry).getTime() : null;
  const expCls = expT == null ? "text-slate-400" : expT < Date.now() ? "text-rose-600" : (expT - Date.now() < 30 * 86400000 ? "text-amber-600" : "text-emerald-600");

  function save() {
    const fd = new FormData();
    fd.set("soldierId", soldier.id); fd.set("civilianLicenseNumber", num); fd.set("civilianLicenseGrade", grade); fd.set("civilianLicenseExpiry", expiry);
    if (photo && photo !== soldier.licensePhotoData) fd.set("licensePhotoData", photo);
    start(async () => { const r = await saveLicenseDetails(fd); setMsg(r.error ? "⚠️ " + r.error : "✅ נשמר"); router.refresh(); });
  }

  return (
    <Card className="p-4">
      <h3 className="font-bold text-slate-800 text-sm mb-3">🪪 רישיון נהיגה אזרחי + צילום (קובץ 4)</h3>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <label className="text-xs text-slate-600">מספר רישיון
          <input value={num} onChange={(e) => setNum(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
        <label className="text-xs text-slate-600">דרגות (B, C1, C, E)
          <input value={grade} onChange={(e) => setGrade(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
        <label className="text-xs text-slate-600">תוקף רישיון
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={`mt-1 w-full border rounded-lg px-2 py-1.5 text-sm font-medium ${expiry ? expCls : "text-slate-500"} ${expT != null && expT < Date.now() ? "border-rose-400" : "border-slate-300"}`} /></label>
        <div className="text-xs text-slate-600">צילום רישיון
          <div className="mt-1 flex items-center gap-2">
            <label className="cursor-pointer text-xs bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1.5">
              {photo ? "החלף" : "📷 העלה"}
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await fileImage(f)); }} />
            </label>
            {photo && <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="" className="h-9 w-9 rounded object-cover border" />
              <button onClick={() => { setPhoto(null); start(async () => { await removeLicensePhoto(soldier.id); router.refresh(); }); }} className="text-[11px] text-rose-500">הסר</button>
            </>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button onClick={save} disabled={pending} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 disabled:opacity-50">💾 שמור רישיון</button>
        {msg && <span className="text-xs text-slate-600">{msg}</span>}
        {expiry && expT != null && expT - Date.now() < 30 * 86400000 && <span className="text-xs text-amber-700">⚠️ רישיון פג בעוד פחות מחודש — נכנס לדוח היומי לקצין רכב</span>}
      </div>
    </Card>
  );
}

// ============ מילוי טופס ============
function FormFiller({
  formType, rec, soldier, prefillCtx, onClose, onSaved,
}: {
  formType: FormType; rec?: FormRec; soldier: Soldier;
  prefillCtx: Parameters<typeof prefillValue>[1];
  onClose: () => void; onSaved: () => void;
}) {
  const def = DRIVER_FORMS[formType];
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = { ...(rec?.data ?? {}) };
    for (const sec of def.sections) for (const f of sec.fields) {
      if (init[f.key] == null && f.prefill) { const v = prefillValue(f.prefill, prefillCtx); if (v) init[f.key] = v; }
    }
    return init;
  });
  const [sig, setSig] = useState(rec?.signatureData ?? "");
  const [signerName, setSignerName] = useState(rec?.signerName ?? soldier.fullName);
  const [signerPN, setSignerPN] = useState(rec?.signerPersonalNumber ?? soldier.personalNumber);

  const setVal = (k: string, v: unknown) => setValues((p) => ({ ...p, [k]: v }));
  const setGrid = (k: string, row: string, col: string, v: string) =>
    setValues((p) => { const g = { ...((p[k] as Record<string, Record<string, string>>) ?? {}) }; g[row] = { ...(g[row] ?? {}), [col]: v }; return { ...p, [k]: g }; });

  function submit() {
    setErr(null);
    start(async () => {
      const r = await saveDriverForm(soldier.id, formType, values, { signatureData: sig, signerName, signerPersonalNumber: signerPN });
      if (r.error) { setErr(r.error); return; }
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start sm:items-center justify-center p-0 sm:p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl my-0 sm:my-4" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 p-4 flex items-center justify-between rounded-t-2xl z-10">
          <h3 className="font-bold text-slate-800">📝 {def.title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
        </div>
        <div className="p-4 space-y-4">
          {def.declaration && (
            <ol className="text-xs text-slate-600 space-y-1 list-decimal pr-4 bg-slate-50 rounded-lg p-3">
              {def.declaration.map((c, i) => <li key={i}>{c}</li>)}
            </ol>
          )}
          {def.sections.map((sec) => (
            <div key={sec.title}>
              <div className="text-sm font-bold text-slate-700 mb-1">{sec.title}</div>
              {sec.note && <div className="text-[11px] text-slate-400 mb-2">{sec.note}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sec.fields.map((f) => <FieldInput key={f.key} f={f} values={values} setVal={setVal} setGrid={setGrid} />)}
              </div>
            </div>
          ))}

          {/* חתימה */}
          <div className="border-t border-slate-100 pt-3">
            <div className="grid grid-cols-2 gap-2 mb-2">
              <label className="text-xs text-slate-600">שם החותם
                <input value={signerName} onChange={(e) => setSignerName(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
              <label className="text-xs text-slate-600">מ.א החותם
                <input value={signerPN} onChange={(e) => setSignerPN(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-mono" /></label>
            </div>
            {rec?.signatureData && !sig && (
              <div className="text-[11px] text-slate-400 mb-1">חתימה קיימת שמורה — חתום מחדש כדי להחליף.</div>
            )}
            <SigPadInline label="חתימה" onChange={setSig} />
          </div>

          {err && <p className="text-rose-600 text-sm text-center">{err}</p>}
        </div>
        <div className="sticky bottom-0 bg-white border-t border-slate-100 p-3 flex gap-2 justify-end">
          <button onClick={onClose} className="text-sm border border-slate-300 rounded-lg px-4 py-2 hover:bg-slate-50">ביטול</button>
          <button onClick={submit} disabled={pending} className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-5 py-2 font-bold disabled:opacity-50">
            {pending ? "שומר…" : "💾 שמור טופס"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ הדפסה ============
function printForm(formType: FormType, rec: FormRec, soldier: Soldier, battalion: { name: string; logoData: string | null }) {
  const def = DRIVER_FORMS[formType];
  const win = window.open("", "_blank");
  if (!win) return;
  const esc = (s: unknown) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
  const val = (k: string) => rec.data[k];

  const fieldHtml = (f: FieldDef): string => {
    if (f.type === "grid") {
      const g = (val(f.key) as Record<string, Record<string, string>>) ?? {};
      const rowsH = (f.rows ?? []).map((row) => `<tr><td>${esc(row)}</td>${(f.columns ?? []).map((c) => `<td>${esc(g[row]?.[c.key] ?? "—")}</td>`).join("")}</tr>`).join("");
      return `<table class="grid"><thead><tr><th></th>${(f.columns ?? []).map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${rowsH}</tbody></table>`;
    }
    if (f.type === "checkbox") return `<div class="row"><span class="cb">${val(f.key) ? "☑" : "☐"}</span> ${esc(f.label)}</div>`;
    return `<div class="row"><b>${esc(f.label)}:</b> <span class="ln">${esc(val(f.key) || "")}</span></div>`;
  };

  const sections = def.sections.map((sec) =>
    `<h3>${esc(sec.title)}</h3>${sec.fields.map(fieldHtml).join("")}`).join("");
  const declaration = def.declaration ? `<ol>${def.declaration.map((c) => `<li>${esc(c)}</li>`).join("")}</ol>` : "";

  win.document.write(`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>${esc(def.title)}</title><style>
    body{font-family:system-ui,Arial,sans-serif;direction:rtl;padding:28px;font-size:13px;color:#0f172a;}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:8px;margin-bottom:14px;}
    .head img{height:56px;} h1{font-size:18px;margin:0;} .sub{color:#475569;font-size:12px;margin-top:2px;}
    h3{font-size:14px;margin:14px 0 4px;border-bottom:1px solid #cbd5e1;padding-bottom:2px;}
    .row{margin:3px 0;} .ln{border-bottom:1px dotted #94a3b8;padding:0 40px 0 4px;} .cb{font-size:15px;}
    table.grid{width:100%;border-collapse:collapse;margin:6px 0;} table.grid th,table.grid td{border:1px solid #cbd5e1;padding:4px 6px;text-align:right;font-size:12px;}
    ol{font-size:12px;padding-right:18px;} ol li{margin:2px 0;}
    .sign{margin-top:26px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px;}
    .sign .box{flex:1;} .sign img{max-height:70px;} .sigline{border-top:1px solid #0f172a;padding-top:3px;font-size:12px;margin-top:40px;}
    @media print{body{padding:0;}}
  </style></head><body>
    <div class="head">
      <div><h1>${esc(def.title)}</h1><div class="sub">${esc(battalion.name)} · נהג: ${esc(soldier.fullName)} · מ.א ${esc(soldier.personalNumber)} · פלוגה ${esc(soldier.company)}</div>
      <div class="sub">תאריך מילוי: ${rec.filledAt ? new Date(rec.filledAt).toLocaleDateString("he-IL") : new Date().toLocaleDateString("he-IL")}${rec.validUntil ? ` · בתוקף עד: ${new Date(rec.validUntil).toLocaleDateString("he-IL")}` : ""}</div></div>
      ${battalion.logoData ? `<img src="${battalion.logoData}" alt="" />` : ""}
    </div>
    ${declaration}
    ${sections}
    <div class="sign">
      <div class="box"><div class="sigline">חתימה: ${rec.signerName ? esc(rec.signerName) : "_______________"}${rec.signerPersonalNumber ? ` · מ.א ${esc(rec.signerPersonalNumber)}` : ""}</div></div>
      ${rec.signatureData ? `<img src="${rec.signatureData}" alt="חתימה" />` : ""}
    </div>
  </body></html>`);
  win.document.close();
  win.focus();
  win.print();
}
