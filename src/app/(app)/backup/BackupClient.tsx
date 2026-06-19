"use client";

import { useState } from "react";
import { verifyBackupExcel, type VerifyResult } from "./actions";

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  found: { text: "✅ נמצא — תואם", color: "bg-emerald-50 border-emerald-300 text-emerald-800" },
  not_found: { text: "❌ לא נמצא במערכת", color: "bg-rose-50 border-rose-300 text-rose-800" },
  mismatch: { text: "⚠️ נמצא — חוסר התאמה", color: "bg-amber-50 border-amber-300 text-amber-800" },
};

export default function BackupClient() {
  const [results, setResults] = useState<VerifyResult[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResults(null);
    const formData = new FormData(e.currentTarget);
    const res = await verifyBackupExcel(formData);
    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else {
      setResults(res.results);
    }
  };

  const found = results?.filter((r) => r.status === "found").length ?? 0;
  const notFound = results?.filter((r) => r.status === "not_found").length ?? 0;
  const mismatch = results?.filter((r) => r.status === "mismatch").length ?? 0;

  return (
    <div className="space-y-4">
      {/* Upload form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
          <div className="flex-1 min-w-0">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              📂 קובץ אקסל מגיבוי (xlsx)
            </label>
            <input
              type="file"
              name="file"
              accept=".xlsx,.xls"
              required
              className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:px-4 file:py-2 file:text-sm file:cursor-pointer hover:file:bg-blue-700"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-50 shrink-0"
          >
            {loading ? "בודק..." : "🔍 בדוק קובץ"}
          </button>
        </div>
        {error && <p className="text-sm text-rose-600 mt-2">⚠️ {error}</p>}
      </form>

      {/* Summary */}
      {results && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
          <h2 className="text-base font-bold text-slate-800 mb-3">📊 סיכום בדיקה</h2>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
              <div className="text-2xl font-bold text-emerald-700">{found}</div>
              <div className="text-xs text-emerald-600">תואם</div>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-center">
              <div className="text-2xl font-bold text-amber-700">{mismatch}</div>
              <div className="text-xs text-amber-600">חוסר התאמה</div>
            </div>
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-center">
              <div className="text-2xl font-bold text-rose-700">{notFound}</div>
              <div className="text-xs text-rose-600">לא נמצא</div>
            </div>
          </div>

          {/* Results list */}
          <div className="space-y-3">
            {results.map((r) => {
              const st = STATUS_LABEL[r.status];
              return (
                <div key={r.docNum} className={`rounded-lg border p-3 ${st.color}`}>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-mono font-bold text-sm">{r.docNum}</span>
                    <span className="text-xs">{st.text}</span>
                    <span className="text-xs text-slate-500">({r.lines.length} שורות באקסל)</span>
                  </div>

                  {/* Excel data summary */}
                  {r.lines[0] && (
                    <div className="text-xs text-slate-600 mb-1">
                      {r.lines[0].type && <span>{r.lines[0].type} · </span>}
                      {r.lines[0].from && <span>{r.lines[0].from} → </span>}
                      {r.lines[0].to && <span>{r.lines[0].to} · </span>}
                      {r.lines[0].date && <span>{r.lines[0].date}</span>}
                    </div>
                  )}

                  {/* DB info if found */}
                  {r.dbInfo && (
                    <div className="text-xs text-slate-600">
                      <span className="font-medium">מערכת:</span>{" "}
                      {r.dbInfo.type} · {r.dbInfo.from} → {r.dbInfo.to} · {r.dbInfo.date} ·{" "}
                      {r.dbInfo.lineCount} שורות · סה״כ {r.dbInfo.totalQty} · {r.dbInfo.status}
                    </div>
                  )}

                  {/* Mismatches */}
                  {r.mismatches && r.mismatches.length > 0 && (
                    <div className="mt-1.5 text-xs">
                      {r.mismatches.map((m, i) => (
                        <div key={i} className="text-amber-900">⚠️ {m}</div>
                      ))}
                    </div>
                  )}

                  {/* Item details (collapsed) */}
                  <details className="mt-2">
                    <summary className="text-xs cursor-pointer text-slate-500 hover:text-slate-700">
                      הצג פריטים ({r.lines.length})
                    </summary>
                    <div className="mt-1 overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-white/50">
                            <th className="border border-slate-300 px-2 py-1 text-right">פריט</th>
                            <th className="border border-slate-300 px-2 py-1 text-right">מק״ט</th>
                            <th className="border border-slate-300 px-2 py-1 text-right">סריאלי</th>
                            <th className="border border-slate-300 px-2 py-1 text-center">כמות</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.lines.map((l) => (
                            <tr key={l.row}>
                              <td className="border border-slate-300 px-2 py-1">{l.item}</td>
                              <td className="border border-slate-300 px-2 py-1 font-mono">{l.sku}</td>
                              <td className="border border-slate-300 px-2 py-1 font-mono">{l.serial}</td>
                              <td className="border border-slate-300 px-2 py-1 text-center">{l.qty}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
