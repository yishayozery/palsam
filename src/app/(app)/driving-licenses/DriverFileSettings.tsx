"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { saveFormValidity } from "../driver-files/actions";
import { DRIVER_FORMS, FORM_ORDER, type FormType } from "@/lib/driverForms";

type ValidityRow = { formType: FormType; title: string; days: number };

export default function DriverFileSettings({ validities, canEdit }: { validities: ValidityRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<FormType>(FORM_ORDER[0]);

  function save(formType: string, days: string) {
    const fd = new FormData(); fd.set("formType", formType); fd.set("validityDays", days);
    start(async () => { await saveFormValidity(fd); router.refresh(); });
  }

  const def = DRIVER_FORMS[preview];

  return (
    <div className="space-y-4">
      {/* תוקף פר-טופס */}
      <Card className="p-4">
        <h3 className="font-bold text-slate-700 text-sm mb-1">⚙️ ימי תוקף פר-טופס</h3>
        <p className="text-xs text-slate-400 mb-3">0 = ללא תוקף (קבוע). חל על טפסים שימולאו/יעודכנו מכאן והלאה.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {validities.map((v) => (
            <div key={v.formType} className="border border-slate-200 rounded-lg p-3">
              <div className="text-sm font-medium text-slate-700 mb-1">{v.title}</div>
              <div className="flex items-center gap-2">
                <input type="number" min="0" defaultValue={v.days} disabled={!canEdit || pending}
                  onBlur={(e) => { if (parseInt(e.target.value, 10) !== v.days) save(v.formType, e.target.value); }}
                  className="w-24 border border-slate-300 rounded px-2 py-1 text-sm" />
                <span className="text-xs text-slate-400">ימים</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* תצוגת טופס גנרי (ריק) */}
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h3 className="font-bold text-slate-700 text-sm">📄 תצוגת טופס גנרי (ריק)</h3>
          <div className="flex gap-1.5 flex-wrap">
            {FORM_ORDER.map((ft) => (
              <button key={ft} onClick={() => setPreview(ft)}
                className={`text-xs rounded-lg px-3 py-1.5 border ${preview === ft ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
                {DRIVER_FORMS[ft].title}
              </button>
            ))}
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 max-w-2xl">
          <h4 className="font-bold text-slate-800 mb-2">{def.title}</h4>
          {def.declaration && (
            <ol className="text-xs text-slate-600 space-y-1 list-decimal pr-4 mb-3">
              {def.declaration.map((c, i) => <li key={i}>{c}</li>)}
            </ol>
          )}
          {def.sections.map((sec) => (
            <div key={sec.title} className="mb-3">
              <div className="text-sm font-bold text-slate-700 border-b border-slate-200 pb-0.5 mb-1.5">{sec.title}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {sec.fields.map((f) => (
                  <div key={f.key} className={`text-xs text-slate-600 ${f.type === "grid" || f.full ? "sm:col-span-2" : ""}`}>
                    {f.type === "grid" ? (
                      <div>
                        <div className="mb-1">{f.label}:</div>
                        <table className="border border-slate-300 text-[11px]">
                          <tbody>
                            {(f.rows ?? []).map((r) => (
                              <tr key={r}><td className="border border-slate-200 px-2 py-0.5">{r}</td>
                                {(f.columns ?? []).map((c) => <td key={c.key} className="border border-slate-200 px-2 py-0.5 text-slate-400">{(c.options ?? []).join(" / ")}</td>)}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : f.type === "checkbox" ? (
                      <div>☐ {f.label}</div>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span>{f.label}:</span>
                        <span className="flex-1 border-b border-dotted border-slate-400 min-w-[60px]">&nbsp;</span>
                        {(f.type === "select" || f.type === "passfail") && <span className="text-slate-400 text-[10px]">({(f.options ?? []).join(" / ")})</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="mt-4 pt-3 border-t border-slate-300 text-xs text-slate-500 flex justify-between">
            <span>חתימה: ______________ · מ.א: __________</span>
            <span>תאריך: __________</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
