"use client";

import { useRouter } from "next/navigation";
import { PageHeader, Card } from "@/components/ui";
import { TRANSFER_TYPE } from "@/lib/labels";
import { escapeHtml } from "@/lib/escape-html";

type StateReport = {
  statuses: { id: string; name: string }[];
  rows: { itemTypeId: string; name: string; byStatus: number[]; total: number }[];
  statusTotals: number[];
  grandTotal: number;
};
type MovementsReport = {
  summaryRows: { name: string; in: number; out: number }[];
  detail: { time: string; dir: "in" | "out" | null; type: string; item: string; serial: string | null; qty: number; counterparty: string; status: string | null; by: string; doc: string }[];
  totalIn: number;
  totalOut: number;
  count: number;
};

export default function ReportsClient({
  warehouses, selectedId, selectedName, tab, from, to, state, movements,
}: {
  warehouses: { id: string; name: string }[];
  selectedId: string;
  selectedName: string;
  tab: "state" | "movements";
  from: string;
  to: string;
  state: StateReport | null;
  movements: MovementsReport | null;
}) {
  const router = useRouter();
  const nav = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ warehouse: selectedId, tab, from, to, ...patch });
    router.push(`/signatures/warehouse-report/reports?${p.toString()}`);
  };
  const exportUrl = `/signatures/warehouse-report/reports/export?${new URLSearchParams({ warehouse: selectedId, tab, from, to }).toString()}`;

  const title = tab === "state" ? "מצב מחסן" : "סיכום תנועות יומי";
  const dateLabel = tab === "movements" ? (from === to ? from : `${from} — ${to}`) : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());

  // בניית טקסט לשיתוף/הדפסה
  const buildText = () => {
    const lines = [`📋 ${title} — ${selectedName}`, `📅 ${dateLabel}`, ""];
    if (tab === "state" && state) {
      lines.push(`סה״כ ${state.grandTotal} יח׳:`);
      for (const r of state.rows) {
        const parts = state.statuses.map((s, i) => (r.byStatus[i] > 0 ? `${s.name} ${r.byStatus[i]}` : null)).filter(Boolean);
        lines.push(`• ${r.name}: ${r.total} (${parts.join(", ")})`);
      }
    } else if (tab === "movements" && movements) {
      lines.push(`נכנס ${movements.totalIn} · יצא ${movements.totalOut} · ${movements.count} תעודות`, "");
      for (const r of movements.summaryRows) lines.push(`• ${r.name}: +${r.in} / -${r.out}`);
    }
    return lines.join("\n");
  };

  const shareWhatsApp = () => window.open(`https://wa.me/?text=${encodeURIComponent(buildText())}`, "_blank");

  const printReport = () => {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    let body = "";
    if (tab === "state" && state) {
      body = `<table><thead><tr><th>פריט</th>${state.statuses.map((s) => `<th>${escapeHtml(s.name)}</th>`).join("")}<th>סה״כ</th></tr></thead><tbody>${
        state.rows.map((r) => `<tr><td>${escapeHtml(r.name)}</td>${r.byStatus.map((n) => `<td>${n || "—"}</td>`).join("")}<td><b>${r.total}</b></td></tr>`).join("")
      }<tr class="tot"><td>סה״כ</td>${state.statusTotals.map((n) => `<td>${n}</td>`).join("")}<td>${state.grandTotal}</td></tr></tbody></table>`;
    } else if (tab === "movements" && movements) {
      body = `<h3>סיכום פר-פריט</h3><table><thead><tr><th>פריט</th><th>נכנס</th><th>יצא</th></tr></thead><tbody>${
        movements.summaryRows.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${r.in}</td><td>${r.out}</td></tr>`).join("")
      }</tbody></table><h3>פירוט תנועות</h3><table><thead><tr><th>שעה</th><th>סוג</th><th>פריט</th><th>סריאלי</th><th>כמות</th><th>מול</th><th>בוצע ע״י</th></tr></thead><tbody>${
        movements.detail.map((d) => `<tr><td>${new Date(d.time).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</td><td>${escapeHtml(TRANSFER_TYPE[d.type as keyof typeof TRANSFER_TYPE] ?? d.type)}</td><td>${escapeHtml(d.item)}</td><td>${d.serial ? escapeHtml(d.serial) : "—"}</td><td>${d.qty}</td><td>${escapeHtml(d.counterparty)}</td><td>${escapeHtml(d.by)}</td></tr>`).join("")
      }</tbody></table>`;
    }
    w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial;padding:20px}h2{margin:0}table{border-collapse:collapse;width:100%;margin:10px 0;font-size:13px}th,td{border:1px solid #cbd5e1;padding:4px 8px;text-align:right}th{background:#1f2937;color:#fff}.tot td{background:#f1f5f9;font-weight:bold}</style></head><body><h2>${escapeHtml(title)} — ${escapeHtml(selectedName)}</h2><div>📅 ${escapeHtml(dateLabel)}</div>${body}<script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <div>
      <PageHeader title={`📊 ${title}`} subtitle={`${selectedName} · ${dateLabel}`} />

      {/* בקרה */}
      <Card className="mb-4 p-3 flex flex-wrap items-center gap-2">
        <select value={selectedId} onChange={(e) => nav({ warehouse: e.target.value })} className="rounded border border-slate-300 px-2 py-1 text-sm">
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          <button onClick={() => nav({ tab: "state" })} className={`px-3 py-1 text-sm ${tab === "state" ? "bg-blue-600 text-white" : "bg-white text-slate-600"}`}>מצב מחסן</button>
          <button onClick={() => nav({ tab: "movements" })} className={`px-3 py-1 text-sm ${tab === "movements" ? "bg-blue-600 text-white" : "bg-white text-slate-600"}`}>תנועות יומי</button>
        </div>
        {tab === "movements" && (
          <div className="flex items-center gap-1 text-sm">
            <input type="date" value={from} onChange={(e) => nav({ from: e.target.value, to: e.target.value > to ? e.target.value : to })} className="rounded border border-slate-300 px-2 py-1" />
            <span className="text-slate-400">—</span>
            <input type="date" value={to} min={from} onChange={(e) => nav({ to: e.target.value })} className="rounded border border-slate-300 px-2 py-1" />
          </div>
        )}
        <div className="grow" />
        <button onClick={printReport} className="text-sm bg-slate-100 border border-slate-300 rounded px-3 py-1 hover:bg-slate-200">🖨️ הדפסה</button>
        <button onClick={shareWhatsApp} className="text-sm bg-emerald-50 border border-emerald-300 text-emerald-700 rounded px-3 py-1 hover:bg-emerald-100">📲 ווטסאפ</button>
        <a href={exportUrl} className="text-sm bg-green-600 text-white rounded px-3 py-1 hover:bg-green-700">⬇️ אקסל</a>
      </Card>

      {/* מצב מחסן */}
      {tab === "state" && state && (
        <Card className="overflow-x-auto">
          {state.rows.length === 0 ? <div className="p-6 text-center text-slate-400">אין מלאי במחסן זה</div> : (
            <table className="min-w-full text-sm">
              <thead><tr className="bg-slate-50 text-slate-500 text-xs">
                <th className="px-3 py-2 text-right">פריט</th>
                {state.statuses.map((s) => <th key={s.id} className="px-3 py-2 text-center">{s.name}</th>)}
                <th className="px-3 py-2 text-center font-bold">סה״כ</th>
              </tr></thead>
              <tbody>
                {state.rows.map((r) => (
                  <tr key={r.itemTypeId} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 font-medium">{r.name}</td>
                    {r.byStatus.map((n, i) => <td key={i} className="px-3 py-1.5 text-center">{n || <span className="text-slate-300">—</span>}</td>)}
                    <td className="px-3 py-1.5 text-center font-bold">{r.total}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                  <td className="px-3 py-1.5">סה״כ</td>
                  {state.statusTotals.map((n, i) => <td key={i} className="px-3 py-1.5 text-center">{n}</td>)}
                  <td className="px-3 py-1.5 text-center">{state.grandTotal}</td>
                </tr>
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* תנועות יומי */}
      {tab === "movements" && movements && (
        <>
          <Card className="mb-4 overflow-x-auto">
            <div className="bg-slate-50 px-4 py-2 font-bold text-slate-700 border-b flex items-center justify-between">
              <span>סיכום פר-פריט</span>
              <span className="text-sm font-normal text-slate-500">נכנס {movements.totalIn} · יצא {movements.totalOut} · {movements.count} תעודות</span>
            </div>
            {movements.summaryRows.length === 0 ? <div className="p-6 text-center text-slate-400">אין תנועות בטווח זה</div> : (
              <table className="min-w-full text-sm">
                <thead><tr className="bg-slate-50 text-slate-500 text-xs"><th className="px-3 py-2 text-right">פריט</th><th className="px-3 py-2 text-center">נכנס ⬅️</th><th className="px-3 py-2 text-center">יצא ➡️</th></tr></thead>
                <tbody>{movements.summaryRows.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100"><td className="px-3 py-1.5 font-medium">{r.name}</td><td className="px-3 py-1.5 text-center text-emerald-600">{r.in || "—"}</td><td className="px-3 py-1.5 text-center text-amber-600">{r.out || "—"}</td></tr>
                ))}</tbody>
              </table>
            )}
          </Card>
          {movements.detail.length > 0 && (
            <Card className="overflow-x-auto">
              <div className="bg-slate-50 px-4 py-2 font-bold text-slate-700 border-b">פירוט תנועות ({movements.detail.length})</div>
              <table className="min-w-full text-sm">
                <thead><tr className="bg-slate-50 text-slate-500 text-xs">
                  <th className="px-3 py-2 text-right">שעה</th><th className="px-3 py-2 text-right">סוג</th><th className="px-3 py-2 text-right">פריט</th><th className="px-3 py-2 text-right">סריאלי</th><th className="px-3 py-2 text-center">כמות</th><th className="px-3 py-2 text-right">מול</th><th className="px-3 py-2 text-right">בוצע ע״י</th>
                </tr></thead>
                <tbody>{movements.detail.map((d, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 whitespace-nowrap">{new Date(d.time).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-3 py-1.5"><span className={d.dir === "in" ? "text-emerald-600" : d.dir === "out" ? "text-amber-600" : ""}>{TRANSFER_TYPE[d.type as keyof typeof TRANSFER_TYPE] ?? d.type}</span></td>
                    <td className="px-3 py-1.5">{d.item}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{d.serial ?? "—"}</td>
                    <td className="px-3 py-1.5 text-center">{d.qty}</td>
                    <td className="px-3 py-1.5">{d.counterparty}</td>
                    <td className="px-3 py-1.5 text-slate-500">{d.by}</td>
                  </tr>
                ))}</tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
