"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { setSoldierIronNumber } from "../actions";

type Item = { name: string; serial: string | null; status: string | null; qty?: number; location?: string | null; expiry?: string | null };
type Soldier = { id: string; name: string; pn: string | null; iron: number | null; items: Item[] };
type Company = { name: string; soldiers: Soldier[] };

export default function WarehouseReportClient({
  warehouses, selectedId, selectedName, canEditIron, companies,
}: {
  warehouses: { id: string; name: string }[];
  selectedId: string; selectedName: string; canEditIron: boolean;
  companies: Company[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"detailed" | "summary">("detailed");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies
      .map((c) => ({ ...c, soldiers: c.soldiers.filter((s) =>
        s.name.toLowerCase().includes(q) || (s.pn || "").includes(q) || String(s.iron ?? "").includes(q) ||
        s.items.some((it) => it.name.toLowerCase().includes(q) || (it.serial || "").toLowerCase().includes(q))) }))
      .filter((c) => c.soldiers.length > 0);
  }, [companies, search]);

  // סיכום פלוגתי מצומצם: לכל פלוגה — ספירת כל סוג פריט
  const summary = useMemo(() => {
    return filtered.map((c) => {
      const counts = new Map<string, number>();
      let total = 0;
      for (const s of c.soldiers) for (const it of s.items) {
        const n = it.qty ?? 1;
        counts.set(it.name, (counts.get(it.name) ?? 0) + n);
        total += n;
      }
      return {
        name: c.name,
        soldiers: c.soldiers.length,
        total,
        items: [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      };
    });
  }, [filtered]);

  function exportCsv() {
    let rows: (string | number)[][];
    let fname: string;
    if (mode === "summary") {
      rows = [["מחסן", "פלוגה", "פריט", "כמות"]];
      for (const c of summary) for (const [item, n] of c.items) rows.push([selectedName, c.name, item, n]);
      fname = `סיכום-פלוגתי-${selectedName}.csv`;
    } else {
      rows = [["מחסן", "פלוגה", "מספר ברזל", "שם חייל", "מ.א", "פריט", "סריאל / אצווה", "כמות", "תפוגה", "סטטוס", "מיקום"]];
      for (const c of filtered) for (const s of c.soldiers) for (const it of s.items) {
        rows.push([selectedName, c.name, s.iron ?? "", s.name, s.pn ?? "", it.name, it.serial ?? "", it.qty ?? "", it.expiry ?? "", it.status ?? "", it.location ?? ""]);
      }
      fname = `ציוד-חתום-מפורט-${selectedName}.csv`;
    }
    const csv = "﻿" + rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fname; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4 no-print">
        {warehouses.length > 1 && (
          <select value={selectedId} onChange={(e) => router.push(`/signatures/warehouse-report?warehouse=${e.target.value}`)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}
        {/* מתג תצוגה: מפורט / מצומצם */}
        <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-sm">
          <button onClick={() => setMode("detailed")}
            className={`px-3 py-2 font-medium ${mode === "detailed" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📋 מפורט</button>
          <button onClick={() => setMode("summary")}
            className={`px-3 py-2 font-medium ${mode === "summary" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📊 מצומצם (פלוגתי)</button>
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 חייל / מ.א / מספר ברזל / פריט..."
          className="flex-1 min-w-[200px] border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        <button onClick={exportCsv} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium">📥 הורד לאקסל</button>
        <button onClick={() => window.print()} className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium">🖨️ הדפסה</button>
      </div>

      <div className="hidden print:block text-center mb-3">
        <h1 className="text-lg font-bold">{mode === "summary" ? "דוח פיזור מצומצם — סיכום פלוגתי" : "דוח ציוד חתום — מפורט"} — {selectedName}</h1>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-6 text-center text-slate-400 text-sm">אין ציוד חתום במחסן זה.</Card>
      ) : mode === "summary" ? (
        /* ===== תצוגה מצומצמת — סיכום פלוגתי ===== */
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-xs">
                  <th className="px-3 py-2 text-right font-medium">פלוגה</th>
                  <th className="px-3 py-2 text-center font-medium w-20">חיילים</th>
                  <th className="px-3 py-2 text-center font-medium w-24">סה״כ פריטים</th>
                  <th className="px-3 py-2 text-right font-medium">פירוט לפי סוג</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.map((c) => (
                  <tr key={c.name} className="align-top">
                    <td className="px-3 py-2 font-bold text-slate-800 whitespace-nowrap">🪖 {c.name}</td>
                    <td className="px-3 py-2 text-center text-slate-600">{c.soldiers}</td>
                    <td className="px-3 py-2 text-center font-bold text-slate-800">{c.total}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {c.items.map(([item, n]) => (
                          <span key={item} className="text-[11px] bg-slate-100 rounded px-2 py-0.5 whitespace-nowrap">
                            {item} <span className="font-bold text-slate-700">×{n}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-bold text-slate-800 border-t-2 border-slate-200">
                  <td className="px-3 py-2">סה״כ</td>
                  <td className="px-3 py-2 text-center">{summary.reduce((n, c) => n + c.soldiers, 0)}</td>
                  <td className="px-3 py-2 text-center">{summary.reduce((n, c) => n + c.total, 0)}</td>
                  <td className="px-3 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      ) : (
        /* ===== תצוגה מפורטת — לפי פלוגה → חייל ===== */
        <div className="space-y-4">
          {filtered.map((c) => (
            <Card key={c.name} className="overflow-hidden">
              <div className="bg-slate-100 px-4 py-2 font-bold text-slate-700 border-b border-slate-200">
                🪖 {c.name} <span className="font-normal text-slate-400 text-sm">· {c.soldiers.length} חיילים</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs">
                      <th className="px-3 py-1.5 text-right font-medium w-24">מס׳ ברזל</th>
                      <th className="px-3 py-1.5 text-right font-medium">חייל</th>
                      <th className="px-3 py-1.5 text-right font-medium">מ.א</th>
                      <th className="px-3 py-1.5 text-right font-medium">ציוד חתום</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {c.soldiers.map((s) => (
                      <tr key={s.id} className="align-top">
                        <td className="px-3 py-2"><IronCell holderId={selectedId} soldierId={s.id} value={s.iron} canEdit={canEditIron} /></td>
                        <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">{s.name}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">{s.pn ?? "—"}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1.5">
                            {s.items.map((it, i) => (
                              <span key={i} className="text-[11px] bg-slate-100 rounded px-2 py-0.5 whitespace-nowrap">
                                {it.name}{it.serial ? <span className="font-mono text-slate-500"> · {it.serial}</span> : it.qty ? ` ×${it.qty}` : ""}
                                {it.status && it.status !== "תקין" && <span className="text-rose-600"> ({it.status})</span>}
                                {it.expiry && <span className="text-amber-600"> · 📅{it.expiry}</span>}
                                {it.location && <span className="text-slate-400"> · 📍{it.location}</span>}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
      <style>{`@media print { .no-print { display: none !important; } }`}</style>
    </div>
  );
}

function IronCell({ holderId, soldierId, value, canEdit }: { holderId: string; soldierId: string; value: number | null; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value != null ? String(value) : "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!canEdit || !editing) {
    return (
      <button onClick={() => canEdit && setEditing(true)} className={`font-mono text-sm ${value != null ? "text-purple-700 font-bold" : "text-slate-300"} ${canEdit ? "hover:underline" : "cursor-default"}`}>
        {value != null ? value : (canEdit ? "＋" : "—")}
      </button>
    );
  }
  function save() {
    setErr(null);
    const fd = new FormData(); fd.set("holderId", holderId); fd.set("soldierId", soldierId); fd.set("number", val);
    start(async () => {
      const res = await setSoldierIronNumber(fd);
      if (res.error) { setErr(res.next ? `${res.error} · פנוי: ${res.next}` : res.error); return; }
      setEditing(false); router.refresh();
    });
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <input value={val} onChange={(e) => setVal(e.target.value.replace(/\D/g, ""))} autoFocus
          className="w-16 border border-slate-300 rounded px-1.5 py-0.5 text-sm font-mono" />
        <button onClick={save} disabled={pending} className="text-[11px] text-blue-600">✓</button>
        <button onClick={() => { setEditing(false); setErr(null); setVal(value != null ? String(value) : ""); }} className="text-[11px] text-slate-400">✕</button>
      </div>
      {err && <span className="text-[10px] text-rose-600">{err}</span>}
    </div>
  );
}
