"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { setSoldierIronNumber, updateSignedItemLocation } from "../actions";

type Loc = { id: string; name: string; isVehicle: boolean };
type Item = { name: string; serial: string | null; status: string | null; qty?: number; location?: string | null; expiry?: string | null; serialUnitId?: string | null; locId?: string | null };
type Soldier = { id: string; name: string; pn: string | null; companyId?: string | null; iron: number | null; items: Item[] };
type Company = { name: string; soldiers: Soldier[] };
type StockSerial = { name: string; serial: string | null; status: string | null; location: string | null; expiry: string | null };
type WarehouseStock = { serials: StockSerial[]; qty: { name: string; qty: number }[] };

export default function WarehouseReportClient({
  warehouses, selectedId, selectedName, canEditIron, companies, locationsByCompanyId = {}, warehouseStock,
}: {
  warehouses: { id: string; name: string }[];
  selectedId: string; selectedName: string; canEditIron: boolean;
  companies: Company[];
  locationsByCompanyId?: Record<string, Loc[]>;
  warehouseStock?: WarehouseStock;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"detailed" | "summary" | "flat">("detailed");
  const [showStock, setShowStock] = useState(false);

  const stock = warehouseStock ?? { serials: [], qty: [] };
  const stockSerialsFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stock.serials;
    return stock.serials.filter((s) => s.name.toLowerCase().includes(q) || (s.serial || "").toLowerCase().includes(q));
  }, [stock.serials, search]);
  const stockQtyFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stock.qty;
    return stock.qty.filter((s) => s.name.toLowerCase().includes(q));
  }, [stock.qty, search]);
  const stockTotal = stock.serials.length + stock.qty.reduce((n, q) => n + q.qty, 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies
      .map((c) => ({ ...c, soldiers: c.soldiers.filter((s) =>
        s.name.toLowerCase().includes(q) || (s.pn || "").includes(q) || String(s.iron ?? "").includes(q) ||
        s.items.some((it) => it.name.toLowerCase().includes(q) || (it.serial || "").toLowerCase().includes(q))) }))
      .filter((c) => c.soldiers.length > 0);
  }, [companies, search]);

  // 📊 טבלת-ציר: שורה=פלוגה, עמודה=סוג פריט, + שורת מחסן (לא חתום) למטה
  const pivot = useMemo(() => {
    const colSet = new Set<string>();
    const compRows = filtered.map((c) => {
      const counts: Record<string, number> = {};
      let total = 0;
      for (const s of c.soldiers) for (const it of s.items) { const n = it.qty ?? 1; counts[it.name] = (counts[it.name] ?? 0) + n; total += n; colSet.add(it.name); }
      return { label: c.name, soldiers: c.soldiers.length, counts, total, isWarehouse: false };
    });
    const whCounts: Record<string, number> = {};
    let whTotal = 0;
    for (const s of stock.serials) { whCounts[s.name] = (whCounts[s.name] ?? 0) + 1; whTotal++; colSet.add(s.name); }
    for (const q of stock.qty) { whCounts[q.name] = (whCounts[q.name] ?? 0) + q.qty; whTotal += q.qty; colSet.add(q.name); }
    const cols = [...colSet];
    const colTotals: Record<string, number> = {};
    for (const col of cols) colTotals[col] = compRows.reduce((n, r) => n + (r.counts[col] ?? 0), 0) + (whCounts[col] ?? 0);
    cols.sort((a, b) => colTotals[b] - colTotals[a] || a.localeCompare(b));
    return { cols, compRows, whRow: { label: "מחסן (לא חתום)", counts: whCounts, total: whTotal }, colTotals,
      grandTotal: compRows.reduce((n, r) => n + r.total, 0) + whTotal, whHasAny: whTotal > 0 };
  }, [filtered, stock]);

  function exportCsv() {
    let rows: (string | number)[][];
    let fname: string;
    if (mode === "summary") {
      // טבלת-ציר: פריט (שורות) × פלוגה (עמודות) + סה"כ (ללא עמודת מחסן — מופיע בתצוגה המפורטת)
      const compLabels = pivot.compRows.map((r) => r.label);
      rows = [["פריט", ...compLabels, "מחסן (לא חתום)", "סה\"כ"]];
      for (const col of pivot.cols) {
        const compVals = pivot.compRows.map((r) => r.counts[col] ?? 0);
        const wh = pivot.whRow.counts[col] ?? 0;
        rows.push([col, ...compVals, wh, compVals.reduce((n, v) => n + v, 0) + wh]);
      }
      rows.push(["סה\"כ", ...pivot.compRows.map((r) => r.total), pivot.whRow.total, pivot.compRows.reduce((n, r) => n + r.total, 0) + pivot.whRow.total]);
      fname = `סיכום-פלוגתי-${selectedName}.csv`;
    } else {
      rows = [["מחסן", "פלוגה", "מספר ברזל", "שם חייל", "מ.א", "פריט", "סריאל / אצווה", "כמות", "תפוגה", "סטטוס", "מיקום"]];
      for (const c of filtered) for (const s of c.soldiers) for (const it of s.items) {
        rows.push([selectedName, c.name, s.iron ?? "", s.name, s.pn ?? "", it.name, it.serial ?? "", it.qty ?? "", it.expiry ?? "", it.status ?? "", it.location ?? ""]);
      }
      // ציוד במחסן — לא חתום
      for (const s of stock.serials) rows.push([selectedName, "🏬 מחסן (לא חתום)", "", "", "", s.name, s.serial ?? "", 1, s.expiry ?? "", s.status ?? "", s.location ?? ""]);
      for (const q of stock.qty) rows.push([selectedName, "🏬 מחסן (לא חתום)", "", "", "", q.name, "", q.qty, "", "", ""]);
      fname = `ציוד-חתום-ומחסן-${selectedName}.csv`;
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
          <button onClick={() => setMode("flat")}
            className={`px-3 py-2 font-medium ${mode === "flat" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📄 טבלה</button>
          <button onClick={() => setMode("summary")}
            className={`px-3 py-2 font-medium ${mode === "summary" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📊 מצומצם (פלוגתי)</button>
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 חייל / מ.א / מספר ברזל / פריט..."
          className="flex-1 min-w-[200px] border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        <button onClick={exportCsv} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium">📥 הורד לאקסל</button>
        <button onClick={() => window.print()} className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium">🖨️ הדפסה</button>
      </div>

      <div className="hidden print:block text-center mb-3">
        <h1 className="text-lg font-bold">{mode === "summary" ? "דוח פיזור מצומצם — סיכום פלוגתי" : "דוח ציוד חתום + מחסן"} — {selectedName}</h1>
      </div>

      {/* 🏬 ציוד במחסן — לא חתום על אף חייל */}
      {stockTotal > 0 && (
        <Card className="mb-4 overflow-hidden border-2 border-teal-200">
          <button onClick={() => setShowStock((v) => !v)}
            className="w-full bg-teal-50 px-4 py-2 font-bold text-teal-800 border-b border-teal-100 flex items-center justify-between hover:bg-teal-100/70">
            <span>🏬 ציוד במחסן (לא חתום)</span>
            <span className="text-sm font-normal text-teal-600">{stockSerialsFiltered.length + stockQtyFiltered.length} סוגים · {stockTotal} יח׳ · {showStock ? "▼" : "◀"}</span>
          </button>
          {showStock && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="bg-slate-50 text-slate-500 text-xs">
                  <th className="px-3 py-1.5 text-right font-medium">פריט</th>
                  <th className="px-3 py-1.5 text-right font-medium">סריאלי / אצווה</th>
                  <th className="px-3 py-1.5 text-center font-medium w-14">כמות</th>
                  <th className="px-3 py-1.5 text-right font-medium">תפוגה</th>
                  <th className="px-3 py-1.5 text-right font-medium">מיקום</th>
                  <th className="px-3 py-1.5 text-right font-medium">סטטוס</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {stockSerialsFiltered.map((s, i) => (
                    <tr key={`ss-${i}`} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5 whitespace-nowrap">{s.name}</td>
                      <td className="px-3 py-1.5 font-mono text-[11px]">{s.serial ?? "—"}</td>
                      <td className="px-3 py-1.5 text-center">1</td>
                      <td className="px-3 py-1.5 text-amber-700 whitespace-nowrap">{s.expiry ?? "—"}</td>
                      <td className="px-3 py-1.5 text-slate-500">{s.location ?? "—"}</td>
                      <td className="px-3 py-1.5">{s.status && s.status !== "תקין" ? <span className="text-rose-600">{s.status}</span> : s.status ?? "—"}</td>
                    </tr>
                  ))}
                  {stockQtyFiltered.map((q, i) => (
                    <tr key={`sq-${i}`} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5 whitespace-nowrap">{q.name}</td>
                      <td className="px-3 py-1.5 text-slate-300">— כמותי —</td>
                      <td className="px-3 py-1.5 text-center font-bold">{q.qty}</td>
                      <td className="px-3 py-1.5">—</td><td className="px-3 py-1.5">—</td><td className="px-3 py-1.5">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {filtered.length === 0 && stockTotal === 0 ? (
        <Card className="p-6 text-center text-slate-400 text-sm">אין ציוד חתום במחסן זה.</Card>
      ) : mode === "summary" ? (
        /* ===== תצוגה מצומצמת — טבלת-ציר: פריט (שורות) × פלוגה (עמודות) ===== */
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-sm border-separate" style={{ borderSpacing: 0 }}>
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-xs">
                  <th className="sticky right-0 z-10 bg-slate-100 px-3 py-2 text-right font-medium border-b border-slate-200">פריט</th>
                  {pivot.compRows.map((r) => (
                    <th key={r.label} className="px-2 py-2 text-center font-medium border-b border-slate-200 whitespace-nowrap min-w-[52px]">
                      🪖 {r.label}
                      <div className="text-[9px] text-slate-400 font-normal">({r.soldiers})</div>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-center font-medium border-b border-slate-200 whitespace-nowrap min-w-[52px] bg-indigo-50 text-indigo-800">
                    🏬 מחסן
                    <div className="text-[9px] text-indigo-400 font-normal">(לא חתום)</div>
                  </th>
                  <th className="px-3 py-2 text-center font-bold border-b border-slate-200 border-r-2 border-r-slate-200 bg-slate-50">סה״כ</th>
                </tr>
              </thead>
              <tbody>
                {pivot.cols.map((col) => (
                  <tr key={col} className="hover:bg-slate-50">
                    <td className="sticky right-0 z-10 bg-white px-3 py-1.5 font-bold text-slate-800 whitespace-nowrap border-b border-slate-100">{col}</td>
                    {pivot.compRows.map((r) => (
                      <td key={r.label} className="px-2 py-1.5 text-center border-b border-slate-100">{r.counts[col] ? <span className="font-medium text-slate-800">{r.counts[col]}</span> : <span className="text-slate-200">·</span>}</td>
                    ))}
                    <td className="px-2 py-1.5 text-center border-b border-slate-100 bg-indigo-50/40">{pivot.whRow.counts[col] ? <span className="font-medium text-indigo-800">{pivot.whRow.counts[col]}</span> : <span className="text-slate-200">·</span>}</td>
                    <td className="px-3 py-1.5 text-center font-bold text-slate-800 border-b border-slate-100 border-r-2 border-r-slate-200 bg-slate-50/60">{pivot.compRows.reduce((n, r) => n + (r.counts[col] ?? 0), 0) + (pivot.whRow.counts[col] ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-300">
                  <td className="sticky right-0 z-10 bg-slate-100 px-3 py-2">סה״כ</td>
                  {pivot.compRows.map((r) => <td key={r.label} className="px-2 py-2 text-center">{r.total}</td>)}
                  <td className="px-2 py-2 text-center text-indigo-800 bg-indigo-50">{pivot.whRow.total}</td>
                  <td className="px-3 py-2 text-center border-r-2 border-r-slate-200">{pivot.compRows.reduce((n, r) => n + r.total, 0) + pivot.whRow.total}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      ) : mode === "flat" ? (
        /* ===== תצוגת טבלה שטוחה — שורה לכל פריט ===== */
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-xs">
                  <th className="px-2 py-2 text-center font-medium w-16">מס׳ ברזל</th>
                  <th className="px-2 py-2 text-right font-medium">פלוגה</th>
                  <th className="px-2 py-2 text-right font-medium">חייל</th>
                  <th className="px-2 py-2 text-right font-medium">מ.א</th>
                  <th className="px-2 py-2 text-right font-medium">פריט</th>
                  <th className="px-2 py-2 text-right font-medium">סריאלי / אצווה</th>
                  <th className="px-2 py-2 text-center font-medium w-14">כמות</th>
                  <th className="px-2 py-2 text-right font-medium">תפוגה</th>
                  <th className="px-2 py-2 text-right font-medium">מיקום</th>
                  <th className="px-2 py-2 text-right font-medium">סטטוס</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.flatMap((c) => c.soldiers.flatMap((s) => s.items.map((it, i) => (
                  <tr key={`${s.id}-${i}`} className="hover:bg-slate-50">
                    <td className="px-2 py-1.5 text-center font-mono text-purple-700">{s.iron ?? "—"}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">{c.name}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap font-medium text-slate-800">{s.name}</td>
                    <td className="px-2 py-1.5 font-mono text-[11px] text-slate-500">{s.pn ?? "—"}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{it.name}</td>
                    <td className="px-2 py-1.5 font-mono text-[11px]">{it.serial ?? "—"}</td>
                    <td className="px-2 py-1.5 text-center">{it.qty ?? (it.serial ? 1 : "—")}</td>
                    <td className="px-2 py-1.5 text-amber-700 whitespace-nowrap">{it.expiry ?? "—"}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {it.serialUnitId
                        ? <LocationCell serialUnitId={it.serialUnitId} value={it.location} locId={it.locId ?? ""} locations={locationsByCompanyId[s.companyId ?? ""] ?? []} canEdit={canEditIron} />
                        : <span className="text-slate-500">{it.location ?? "—"}</span>}
                    </td>
                    <td className="px-2 py-1.5">{it.status && it.status !== "תקין" ? <span className="text-rose-600">{it.status}</span> : it.status ?? "—"}</td>
                  </tr>
                ))))}
              </tbody>
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

function LocationCell({ serialUnitId, value, locId, locations, canEdit }: { serialUnitId: string; value: string | null | undefined; locId: string; locations: Loc[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  if (!canEdit || locations.length === 0) return <span className="text-slate-500">{value ?? "—"}</span>;
  if (!editing) return <button onClick={() => setEditing(true)} className="text-slate-600 hover:underline">{value || "＋ מיקום"}</button>;
  return (
    <select autoFocus disabled={pending} defaultValue={locId} className="border border-slate-300 rounded px-1 py-0.5 text-xs bg-white"
      onChange={(e) => { const v = e.target.value; const fd = new FormData(); fd.set("serialUnitId", serialUnitId); if (v) fd.set("equipmentLocationId", v); start(async () => { await updateSignedItemLocation(fd); setEditing(false); router.refresh(); }); }}
      onBlur={() => setEditing(false)}>
      <option value="">— ללא —</option>
      {locations.map((l) => <option key={l.id} value={l.id}>{l.isVehicle ? "🚗 " : "📍 "}{l.name}</option>)}
    </select>
  );
}
