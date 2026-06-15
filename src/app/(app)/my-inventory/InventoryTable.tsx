"use client";

import { useState, useMemo } from "react";
import { Card, Badge } from "@/components/ui";
import { WAREHOUSE_TYPE_SHORT, WAREHOUSE_TYPE_ICON } from "@/lib/rbac";

export type StatusBreakdown = { statusName: string; qty: number; isWear: boolean; isLoss: boolean };
export type StandardRow = {
  itemTypeId: string;
  itemName: string;
  sku: string | null;
  unit: string;
  categoryName: string | null;
  warehouseType: string | null;
  baseline: number;
  current: number;
  diff: number;
  statusBreakdown: { statusName: string; qty: number; isWear: boolean; isLoss: boolean }[];
  signedOnSoldiers: number;
  serialNumbers: string[];
};

type StatusFilter = "all" | "shortage" | "balanced" | "surplus" | "no_baseline" | "missing_only" | "defective" | "signed";

export default function InventoryTable({ rows }: { rows: StandardRow[] }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [whFilter, setWhFilter] = useState("");

  // אפשרויות מחסן/קטגוריה
  const warehouseTypes = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.warehouseType && s.add(r.warehouseType));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (q.trim()) {
        const s = q.toLowerCase();
        if (!`${r.itemName} ${r.sku ?? ""} ${r.categoryName ?? ""}`.toLowerCase().includes(s)) return false;
      }
      if (whFilter && r.warehouseType !== whFilter) return false;
      switch (statusFilter) {
        case "shortage": if (!(r.diff < 0 && r.baseline > 0)) return false; break;
        case "balanced": if (!(r.diff === 0 && r.baseline > 0)) return false; break;
        case "surplus": if (!(r.diff > 0 && r.baseline > 0)) return false; break;
        case "no_baseline": if (r.baseline > 0) return false; break;
        case "missing_only": if (!(r.current === 0 && r.baseline > 0)) return false; break;
        case "defective": if (!r.statusBreakdown.some((b) => b.isWear || b.isLoss)) return false; break;
        case "signed": if (r.signedOnSoldiers === 0) return false; break;
      }
      return true;
    });
  }, [rows, q, statusFilter, whFilter]);

  const counts = useMemo(() => ({
    shortage: rows.filter((r) => r.diff < 0 && r.baseline > 0).length,
    balanced: rows.filter((r) => r.diff === 0 && r.baseline > 0).length,
    surplus: rows.filter((r) => r.diff > 0 && r.baseline > 0).length,
    noBaseline: rows.filter((r) => r.baseline === 0).length,
    missing: rows.filter((r) => r.current === 0 && r.baseline > 0).length,
    defective: rows.filter((r) => r.statusBreakdown.some((b) => b.isWear || b.isLoss)).length,
    signed: rows.filter((r) => r.signedOnSoldiers > 0).length,
  }), [rows]);

  return (
    <Card className="overflow-hidden">
      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <h3 className="font-bold text-slate-700 flex items-center gap-2">
            <span className="text-xl">📦</span>
            ציוד הפלוגה
          </h3>
          <span className="text-xs text-slate-500">
            {filtered.length} מתוך {rows.length} פריטים
          </span>
        </div>

        {/* פילטרים */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-2">
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 חיפוש שם / מק״ט / קטגוריה"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <select value={whFilter} onChange={(e) => setWhFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">📋 כל הקטגוריות</option>
            {warehouseTypes.map((wh) => (
              <option key={wh} value={wh}>
                {WAREHOUSE_TYPE_ICON[wh as keyof typeof WAREHOUSE_TYPE_ICON]} {WAREHOUSE_TYPE_SHORT[wh as keyof typeof WAREHOUSE_TYPE_SHORT] ?? wh}
              </option>
            ))}
          </select>
          {(q || whFilter || statusFilter !== "all") && (
            <button onClick={() => { setQ(""); setWhFilter(""); setStatusFilter("all"); }}
              className="rounded-lg border border-slate-300 text-sm hover:bg-slate-50">✕ נקה פילטרים</button>
          )}
        </div>

        {/* צ׳יפים לסינון לפי מצב */}
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>הכל ({rows.length})</FilterChip>
          <FilterChip active={statusFilter === "shortage"} onClick={() => setStatusFilter("shortage")} color="rose">⚠️ חסר ({counts.shortage})</FilterChip>
          <FilterChip active={statusFilter === "missing_only"} onClick={() => setStatusFilter("missing_only")} color="rose">🚫 חסר לחלוטין ({counts.missing})</FilterChip>
          <FilterChip active={statusFilter === "balanced"} onClick={() => setStatusFilter("balanced")} color="emerald">✓ מאוזן ({counts.balanced})</FilterChip>
          <FilterChip active={statusFilter === "surplus"} onClick={() => setStatusFilter("surplus")} color="emerald">↩️ עודף ({counts.surplus})</FilterChip>
          <FilterChip active={statusFilter === "no_baseline"} onClick={() => setStatusFilter("no_baseline")} color="slate">ללא תקן ({counts.noBaseline})</FilterChip>
          <FilterChip active={statusFilter === "defective"} onClick={() => setStatusFilter("defective")} color="amber">🟡 כולל בלאי ({counts.defective})</FilterChip>
          <FilterChip active={statusFilter === "signed"} onClick={() => setStatusFilter("signed")} color="blue">🪖 עם חתום ({counts.signed})</FilterChip>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-8 text-center text-slate-400 text-sm">אין פריטים מתאימים לסינון</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right p-2 font-medium text-xs text-slate-600">פריט</th>
                <th className="text-right p-2 font-medium text-xs text-slate-600">קטגוריה</th>
                <th className="text-right p-2 font-medium text-xs text-slate-600">📌 תקן</th>
                <th className="text-right p-2 font-medium text-xs text-slate-600">📦 יש</th>
                <th className="text-right p-2 font-medium text-xs text-slate-600">פירוט סטטוסים</th>
                <th className="text-right p-2 font-medium text-xs text-slate-600">🪖 חתום</th>
                <th className="text-right p-2 font-medium text-xs text-slate-600">הפרש מתקן</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => {
                const rowClass = r.diff < 0 && r.baseline > 0
                  ? "bg-rose-50"
                  : r.diff > 0 && r.baseline > 0 ? "bg-emerald-50/50" : "";
                const whIcon = r.warehouseType ? (WAREHOUSE_TYPE_ICON[r.warehouseType as keyof typeof WAREHOUSE_TYPE_ICON] ?? "📦") : "📦";
                const breakdown = [...r.statusBreakdown].sort((a, b) => b.qty - a.qty);
                const allOK = breakdown.length === 1 && !breakdown[0].isWear && !breakdown[0].isLoss;
                return (
                  <tr key={r.itemTypeId} className={rowClass}>
                    <td className="p-2">
                      <div className="font-medium flex items-center gap-1.5">
                        <span>{whIcon}</span>
                        <span>{r.itemName}</span>
                      </div>
                      {(r.sku || r.serialNumbers.length > 0) && (
                        <div className="text-[11px] text-slate-500 mt-0.5 flex gap-2 flex-wrap">
                          {r.sku && <span className="font-mono">{r.sku}</span>}
                          {r.serialNumbers.length > 0 && r.serialNumbers.length <= 3 && (
                            <span className="font-mono text-slate-400" title={r.serialNumbers.join(", ")}>
                              SN: {r.serialNumbers.join(", ")}
                            </span>
                          )}
                          {r.serialNumbers.length > 3 && (
                            <span className="font-mono text-slate-400" title={r.serialNumbers.join(", ")}>
                              {r.serialNumbers.length} סריאליים
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-xs text-slate-600">
                      {r.categoryName ?? "—"}
                      {r.warehouseType && (
                        <div className="text-[10px] text-slate-400">
                          {WAREHOUSE_TYPE_SHORT[r.warehouseType as keyof typeof WAREHOUSE_TYPE_SHORT] ?? r.warehouseType}
                        </div>
                      )}
                    </td>
                    <td className="p-2 font-mono">
                      <span className="bg-slate-100 rounded px-2 py-0.5">{r.baseline}</span>
                      <span className="text-[10px] text-slate-400 mr-1">{r.unit}</span>
                    </td>
                    <td className="p-2 font-mono">
                      <span className="bg-blue-50 text-blue-700 rounded px-2 py-0.5 font-bold">{r.current}</span>
                      <span className="text-[10px] text-slate-400 mr-1">{r.unit}</span>
                    </td>
                    <td className="p-2">
                      {allOK ? (
                        <Badge className="bg-emerald-100 text-emerald-700">{breakdown[0].statusName}</Badge>
                      ) : breakdown.length === 0 ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <div className="flex gap-1 flex-wrap">
                          {breakdown.map((b, i) => (
                            <Badge key={i} className={
                              b.isLoss ? "bg-rose-100 text-rose-700" :
                              b.isWear ? "bg-amber-100 text-amber-700" :
                              "bg-emerald-100 text-emerald-700"
                            }>
                              {b.qty} {b.statusName}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-xs">
                      {r.signedOnSoldiers > 0 ? (
                        <span className="text-blue-700 font-medium">{r.signedOnSoldiers}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="p-2">
                      {r.diff < 0 && r.baseline > 0 && (
                        <Badge className="bg-rose-100 text-rose-700">⚠️ חסר {Math.abs(r.diff)}</Badge>
                      )}
                      {r.diff === 0 && r.baseline > 0 && (
                        <Badge className="bg-emerald-100 text-emerald-700">✓ מאוזן</Badge>
                      )}
                      {r.diff > 0 && r.baseline > 0 && (
                        <Badge className="bg-emerald-100 text-emerald-700">↩️ {r.diff} לזיכוי</Badge>
                      )}
                      {r.baseline === 0 && (
                        <Badge className="bg-slate-100 text-slate-600">ללא תקן</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="p-2.5 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-600">
        💡 <b>תקן</b> = הכמות שאמורה להישאר אצלכם גם אחרי תעסוקה (קובע מפ&quot;ם). <b>יש</b> = הכמות הכוללת בפלוגה (מלאי + חתום על חיילים).
        פירוט יחידני (SN, חייל, מיקום) — בעמוד <b>📍 מיקומי ציוד</b>.
      </div>
    </Card>
  );
}

function FilterChip({
  children, active, onClick, color = "slate",
}: { children: React.ReactNode; active: boolean; onClick: () => void; color?: "slate" | "rose" | "emerald" | "amber" | "blue" }) {
  const colorMap = {
    slate: active ? "bg-slate-800 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700",
    rose: active ? "bg-rose-700 text-white" : "bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200",
    emerald: active ? "bg-emerald-700 text-white" : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200",
    amber: active ? "bg-amber-700 text-white" : "bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200",
    blue: active ? "bg-blue-700 text-white" : "bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200",
  };
  return (
    <button onClick={onClick}
      className={`text-xs rounded-full px-3 py-1 transition ${colorMap[color]}`}>
      {children}
    </button>
  );
}
