"use client";

import { useState, useMemo } from "react";
import { PageHeader, Card } from "@/components/ui";

type Row = { id: string; location: string; holder: string; item: string; serial: string; qty: number; status: string; company: string; soldier: string };

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-right font-medium text-xs text-slate-500">{children}</th>;
}

export default function LocationEquipmentClient({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");
  const [grouped, setGrouped] = useState(true);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => [r.location, r.holder, r.item, r.serial, r.status, r.company, r.soldier].join(" ").toLowerCase().includes(s));
  }, [rows, q]);

  const byLocation = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of filtered) { const a = m.get(r.location) ?? []; a.push(r); m.set(r.location, a); }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  const rowCells = (r: Row) => (
    <>
      <td className="px-3 py-1.5">{r.item}</td>
      <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{r.serial}</td>
      <td className="px-3 py-1.5 text-center">{r.qty}</td>
      <td className="px-3 py-1.5">{r.status !== "תקין" ? <span className="text-rose-600">{r.status}</span> : r.status}</td>
      <td className="px-3 py-1.5">{r.holder}</td>
      <td className="px-3 py-1.5">{r.company || <span className="text-slate-300">—</span>}</td>
      <td className="px-3 py-1.5">{r.soldier || <span className="text-slate-300">—</span>}</td>
    </>
  );

  return (
    <div>
      <PageHeader title="📍 ציוד לפי מיקום" subtitle={`${rows.length} פריטים · ${new Set(rows.map((r) => r.location)).size} מיקומים`} />

      <Card className="mb-4 p-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 חיפוש (מיקום / פריט / מס״ב / מחסן / פלוגה / חייל)" className="flex-1 min-w-[220px] rounded border border-slate-300 px-3 py-1.5 text-sm" />
        <button onClick={() => setGrouped((v) => !v)} className="text-sm bg-slate-100 border border-slate-300 rounded px-3 py-1.5 hover:bg-slate-200">{grouped ? "📋 רשימה שטוחה" : "📍 קבץ לפי מיקום"}</button>
        <span className="text-xs text-slate-500">{filtered.length} תוצאות</span>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-6 text-center text-slate-400">אין תוצאות</Card>
      ) : grouped ? (
        <div className="space-y-3">
          {byLocation.map(([loc, items]) => (
            <Card key={loc} className="overflow-x-auto">
              <div className="bg-slate-50 px-4 py-2 font-bold text-slate-700 border-b flex items-center justify-between">
                <span>📍 {loc}</span><span className="text-sm font-normal text-slate-500">{items.length} פריטים</span>
              </div>
              <table className="min-w-full text-sm">
                <thead><tr className="bg-slate-50 border-b"><Th>פריט</Th><Th>מס״ב</Th><Th>כמות</Th><Th>סטטוס</Th><Th>מחסן מחתים</Th><Th>פלוגה</Th><Th>חייל</Th></tr></thead>
                <tbody>{items.map((r) => <tr key={r.id} className="border-t border-slate-100">{rowCells(r)}</tr>)}</tbody>
              </table>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="bg-slate-50 border-b"><Th>מיקום</Th><Th>פריט</Th><Th>מס״ב</Th><Th>כמות</Th><Th>סטטוס</Th><Th>מחסן מחתים</Th><Th>פלוגה</Th><Th>חייל</Th></tr></thead>
            <tbody>{filtered.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-1.5 font-medium">{r.location}</td>
                {rowCells(r)}
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
