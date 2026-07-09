"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { saveFormValidity } from "./actions";
import type { FormType } from "@/lib/driverForms";

type FileStatus = "missing" | "valid" | "expiring" | "expired";
type FormCell = { formType: string; status: FileStatus };
type Row = { id: string; name: string; pn: string; company: string; forms: FormCell[]; photoStatus: FileStatus; complete: boolean; anyProblem: boolean; licenseExpiry: string | null };
type ValidityRow = { formType: string; title: string; days: number };

const STATUS: Record<FileStatus, { icon: string; cls: string; label: string }> = {
  valid: { icon: "🟢", cls: "text-emerald-600", label: "תקין" },
  expiring: { icon: "🟡", cls: "text-amber-600", label: "פג בקרוב" },
  expired: { icon: "🔴", cls: "text-rose-600", label: "פג" },
  missing: { icon: "⚪", cls: "text-slate-300", label: "חסר" },
};

export default function DriverFilesClient({
  rows, validityRows, formTitles, canEdit,
}: {
  rows: Row[];
  validityRows: ValidityRow[];
  formTitles: Record<FormType, string>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [pending, start] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.pn.includes(q) || r.company.toLowerCase().includes(q));
  }, [rows, search]);

  const problems = rows.filter((r) => r.anyProblem).length;

  function saveValidity(formType: string, days: string) {
    const fd = new FormData(); fd.set("formType", formType); fd.set("validityDays", days);
    start(async () => { await saveFormValidity(fd); router.refresh(); });
  }

  return (
    <div className="space-y-4">
      <Card className="p-3 flex flex-wrap gap-3 items-center">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 חייל / מ.א / פלוגה…"
          className="flex-1 min-w-[200px] border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        <span className="text-sm text-slate-500">{filtered.length} נהגים · <b className="text-rose-600">{problems}</b> דורשים טיפול</span>
        {canEdit && (
          <button onClick={() => setShowSettings((v) => !v)} className="text-xs border border-slate-300 rounded-lg px-3 py-2 hover:bg-slate-50">
            ⚙️ הגדרות תוקף
          </button>
        )}
      </Card>

      {showSettings && (
        <Card className="p-4">
          <h3 className="font-bold text-slate-700 text-sm mb-3">⚙️ ימי תוקף פר-טופס (0 = ללא תוקף / קבוע)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {validityRows.map((v) => (
              <div key={v.formType} className="border border-slate-200 rounded-lg p-3">
                <div className="text-sm font-medium text-slate-700 mb-1">{v.title}</div>
                <div className="flex items-center gap-2">
                  <input type="number" min="0" defaultValue={v.days} disabled={pending}
                    onBlur={(e) => { if (parseInt(e.target.value, 10) !== v.days) saveValidity(v.formType, e.target.value); }}
                    className="w-24 border border-slate-300 rounded px-2 py-1 text-sm" />
                  <span className="text-xs text-slate-400">ימים</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">שינוי חל על טפסים שימולאו/יעודכנו מכאן והלאה.</p>
        </Card>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-600 text-xs">
              <th className="px-3 py-2 text-right">נהג</th>
              <th className="px-3 py-2 text-right">פלוגה</th>
              {validityRows.map((v) => <th key={v.formType} className="px-2 py-2 text-center" title={v.title}>{v.title.length > 12 ? v.title.slice(0, 11) + "…" : v.title}</th>)}
              <th className="px-2 py-2 text-center">צילום רישיון</th>
              <th className="px-2 py-2 text-center">תוקף רישיון</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer" onClick={() => router.push(`/driver-files/${r.id}`)}>
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-800">{r.name}</div>
                  <div className="text-[11px] text-slate-400 font-mono">{r.pn}</div>
                </td>
                <td className="px-3 py-2 text-slate-500">{r.company}</td>
                {r.forms.map((f) => (
                  <td key={f.formType} className="px-2 py-2 text-center" title={STATUS[f.status].label}>
                    <span className={STATUS[f.status].cls}>{STATUS[f.status].icon}</span>
                  </td>
                ))}
                <td className="px-2 py-2 text-center" title={STATUS[r.photoStatus].label}>
                  <span className={STATUS[r.photoStatus].cls}>{STATUS[r.photoStatus].icon}</span>
                </td>
                <td className="px-2 py-2 text-center text-xs">
                  {r.licenseExpiry
                    ? <span className={new Date(r.licenseExpiry).getTime() < Date.now() ? "text-rose-600 font-medium" : (new Date(r.licenseExpiry).getTime() - Date.now() < 30 * 86400000 ? "text-amber-600 font-medium" : "text-slate-500")}>{r.licenseExpiry}</span>
                    : <span className="text-slate-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <Card className="p-5 text-center text-slate-400 text-sm">לא נמצאו נהגים.</Card>}

      <div className="flex gap-3 flex-wrap text-[11px] text-slate-500">
        {Object.values(STATUS).map((s, i) => <span key={i} className="inline-flex items-center gap-1">{s.icon} {s.label}</span>)}
      </div>
    </div>
  );
}
