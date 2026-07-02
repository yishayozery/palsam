"use client";

import { useState, useMemo, useRef } from "react";
import { Card, Badge } from "@/components/ui";

type ReportLine = {
  id: string;
  itemName: string;
  sku: string | null;
  categoryName: string | null;
  holderId: string | null;
  holderName: string;
  holderKind: string;
  soldierName: string | null;
  soldierPN: string | null;
  serialNumber: string | null;
  location: string | null;
  shelf: string | null;
  expiryDate: string | null;
  expectedQty: number;
  countedQty: number | null;
  status: "reported" | "not_reported" | "discrepancy";
  diff: number | null;
  note: string | null;
  signerName: string | null;
};

type Holder = { id: string; name: string };

const STATUS_LABEL: Record<string, string> = {
  reported: "דווח ✓",
  not_reported: "לא דווח",
  discrepancy: "פער",
};

const STATUS_COLORS: Record<string, string> = {
  reported: "bg-emerald-100 text-emerald-800",
  not_reported: "bg-amber-100 text-amber-800",
  discrepancy: "bg-rose-100 text-rose-800",
};

const ROW_BG: Record<string, string> = {
  reported: "",
  not_reported: "bg-amber-50/50",
  discrepancy: "bg-rose-50/50",
};

export default function SessionReportView({
  lines,
  holders,
  summary,
  startedBy,
  startedAt,
  completedAt,
}: {
  lines: ReportLine[];
  holders: Holder[];
  summary: { total: number; reported: number; notReported: number; discrepancy: number };
  startedBy: string | null;
  startedAt: string;
  completedAt: string | null;
}) {
  const [search, setSearch] = useState("");
  const [holderFilter, setHolderFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "reported" | "not_reported" | "discrepancy">("");
  const printRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    let result = lines;
    if (holderFilter) result = result.filter((l) => l.holderId === holderFilter);
    if (statusFilter) result = result.filter((l) => l.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((l) =>
        l.itemName.toLowerCase().includes(q) ||
        l.serialNumber?.toLowerCase().includes(q) ||
        l.soldierName?.toLowerCase().includes(q) ||
        l.soldierPN?.includes(q) ||
        l.sku?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [lines, holderFilter, statusFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, ReportLine[]>();
    for (const l of filtered) {
      const key = l.holderName;
      (map.get(key) || (() => { const a: ReportLine[] = []; map.set(key, a); return a; })()).push(l);
    }
    return map;
  }, [filtered]);

  const progressPct = summary.total > 0 ? Math.round((summary.reported + summary.discrepancy) / summary.total * 100) : 0;

  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>דוח ספירה</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 20px; font-size: 13px; direction: rtl; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: right; }
      th { background: #f1f5f9; font-weight: 600; }
      .gap { background: #fef2f2; }
      .not-reported { background: #fffbeb; }
      h2 { margin: 20px 0 8px; font-size: 16px; border-bottom: 2px solid #334155; padding-bottom: 4px; }
      .summary { display: flex; gap: 24px; margin: 12px 0; }
      .summary-item { text-align: center; }
      .summary-item .num { font-size: 24px; font-weight: 700; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 8px; font-size: 11px; }
      .badge-green { background: #dcfce7; color: #166534; }
      .badge-amber { background: #fef3c7; color: #92400e; }
      .badge-rose { background: #ffe4e6; color: #9f1239; }
      @media print { body { padding: 0; } }
    </style></head><body>`);
    win.document.write(`<h1>דוח ספירה</h1>`);
    win.document.write(`<p>תאריך: ${completedAt ? new Date(completedAt).toLocaleDateString("he-IL") : "—"} · ביצע: ${startedBy ?? "—"}</p>`);
    win.document.write(`<div class="summary">
      <div class="summary-item"><div class="num">${summary.total}</div>סה״כ</div>
      <div class="summary-item"><div class="num" style="color:#059669">${summary.reported}</div>דווחו</div>
      <div class="summary-item"><div class="num" style="color:#d97706">${summary.notReported}</div>לא דווחו</div>
      <div class="summary-item"><div class="num" style="color:#e11d48">${summary.discrepancy}</div>פערים</div>
    </div>`);

    for (const [holder, items] of grouped) {
      const signer = items[0]?.signerName;
      win.document.write(`<h2>📍 ${holder}${signer ? ` — חתם: ${signer}` : ""}</h2>`);
      win.document.write(`<table><thead><tr>
        <th>פריט</th><th>סריאלי</th><th>חייל</th><th>מיקום</th><th>תוקף</th>
        <th>צפוי</th><th>נספר</th><th>סטטוס</th><th>הערה</th>
      </tr></thead><tbody>`);
      for (const l of items) {
        const rowClass = l.status === "discrepancy" ? "gap" : l.status === "not_reported" ? "not-reported" : "";
        const badgeClass = l.status === "reported" ? "badge-green" : l.status === "discrepancy" ? "badge-rose" : "badge-amber";
        win.document.write(`<tr class="${rowClass}">
          <td>${l.itemName}${l.sku ? ` (${l.sku})` : ""}</td>
          <td>${l.serialNumber ?? "—"}</td>
          <td>${l.soldierName ? `${l.soldierName}${l.soldierPN ? ` (${l.soldierPN})` : ""}` : "—"}</td>
          <td>${[l.location, l.shelf].filter(Boolean).join(" / ") || "—"}</td>
          <td>${l.expiryDate ? new Date(l.expiryDate).toLocaleDateString("he-IL") : "—"}</td>
          <td>${l.expectedQty}</td>
          <td>${l.countedQty ?? "—"}</td>
          <td><span class="badge ${badgeClass}">${STATUS_LABEL[l.status]}</span></td>
          <td>${l.note ?? ""}</td>
        </tr>`);
      }
      win.document.write(`</tbody></table>`);
    }

    win.document.write(`</body></html>`);
    win.document.close();
    win.print();
  };

  return (
    <div ref={printRef} className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 text-center">
          <div className="text-xs text-slate-500">סה״כ פריטים</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{summary.total}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xs text-slate-500">דווחו</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{summary.reported}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xs text-slate-500">לא דווחו</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{summary.notReported}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xs text-slate-500">פערים</div>
          <div className="text-2xl font-bold text-rose-600 mt-1">{summary.discrepancy}</div>
        </Card>
      </div>

      {/* Progress bar */}
      <div className="bg-slate-100 rounded-full h-3 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-emerald-400 transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-500">
        <span>{progressPct}% הושלמו</span>
        <span>ביצע: {startedBy ?? "—"} · {completedAt ? new Date(completedAt).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "בביצוע"}</span>
      </div>

      {/* Filters */}
      <Card className="p-3 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="חיפוש פריט / חייל / סריאלי..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        {holders.length > 1 && (
          <select
            value={holderFilter}
            onChange={(e) => setHolderFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">כל המחזיקים</option>
            {holders.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        )}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">כל הסטטוסים</option>
          <option value="reported">דווחו ✓</option>
          <option value="not_reported">לא דווחו</option>
          <option value="discrepancy">פערים</option>
        </select>
        <button
          type="button"
          onClick={handlePrint}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          🖨️ הדפסה
        </button>
      </Card>

      <div className="text-xs text-slate-400">{filtered.length} מתוך {lines.length} פריטים</div>

      {/* Grouped items */}
      {Array.from(grouped).map(([holder, items]) => (
        <Card key={holder} className="p-4">
          <h3 className="font-bold text-slate-700 mb-3 flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-2">
              <span>📍 {holder}</span>
              {items[0]?.signerName && (
                <Badge className="bg-blue-100 text-blue-800 text-xs">חתם: {items[0].signerName}</Badge>
              )}
            </span>
            <span className="text-xs text-slate-400 font-normal">{items.length} פריטים</span>
          </h3>
          <div className="space-y-1.5">
            {items.map((l) => (
              <div
                key={l.id}
                className={`rounded-lg border p-2.5 ${
                  l.status === "discrepancy" ? "border-rose-300 bg-rose-50/40" :
                  l.status === "not_reported" ? "border-amber-200 bg-amber-50/30" :
                  "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start gap-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{l.itemName}</div>
                    {l.serialNumber && <div className="font-mono text-xs text-slate-400 truncate">SN: {l.serialNumber}</div>}
                    <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      {l.soldierName && (
                        <span className="text-blue-600">🪖 {l.soldierName}{l.soldierPN ? ` (${l.soldierPN})` : ""}</span>
                      )}
                      {l.location && <span className="text-emerald-700">📍 {l.location}</span>}
                      {l.shelf && <span className="text-violet-600">🗄️ {l.shelf}</span>}
                      {l.expiryDate && (
                        <span className={new Date(l.expiryDate) < new Date() ? "text-rose-600 font-medium" : "text-amber-600"}>
                          📅 {new Date(l.expiryDate).toLocaleDateString("he-IL")}
                        </span>
                      )}
                      {l.categoryName && <span className="text-slate-400">📂 {l.categoryName}</span>}
                    </div>
                    {l.note && <div className="text-[11px] text-slate-500 mt-1">💬 {l.note}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge className={STATUS_COLORS[l.status]}>{STATUS_LABEL[l.status]}</Badge>
                    <div className="text-xs text-slate-500">
                      צפוי: <b>{l.expectedQty}</b>
                      {l.countedQty !== null && (
                        <> · נספר: <b className={l.diff !== 0 ? "text-rose-600" : "text-emerald-600"}>{l.countedQty}</b></>
                      )}
                    </div>
                    {l.diff !== null && l.diff !== 0 && (
                      <div className="text-xs font-medium text-rose-700">
                        {l.diff > 0 ? `עודף ${l.diff}` : `חוסר ${Math.abs(l.diff)}`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      {filtered.length === 0 && (
        <Card className="p-5">
          <p className="text-sm text-slate-400 text-center">אין פריטים בסינון הנוכחי.</p>
        </Card>
      )}
    </div>
  );
}
