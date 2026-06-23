"use client";

import React from "react";
import { Card, Button } from "@/components/ui";

type Row = {
  date: string;
  allocated: number;
  actual: number;
  perCompany: { companyName: string; allocated: number; actual: number }[];
};

export default function DailyReportClient({
  employmentName,
  totalDays,
  rows,
  companies,
  today,
}: {
  employmentName: string;
  totalDays: number;
  rows: Row[];
  companies: string[];
  today: string;
}) {
  let cumAlloc = 0;
  let cumActual = 0;
  const enriched = rows.map((r) => {
    cumAlloc += r.allocated;
    cumActual += r.actual;
    const pct = r.allocated > 0 ? Math.round((r.actual / r.allocated) * 100) : 0;
    const cumPct = cumAlloc > 0 ? Math.round((cumActual / cumAlloc) * 100) : 0;
    return { ...r, cumAlloc, cumActual, pct, cumPct };
  });

  const grandAlloc = enriched.length > 0 ? enriched[enriched.length - 1].cumAlloc : 0;
  const grandActual = enriched.length > 0 ? enriched[enriched.length - 1].cumActual : 0;
  const grandPct = grandAlloc > 0 ? Math.round((grandActual / grandAlloc) * 100) : 0;

  function formatDate(iso: string) {
    return new Date(iso + "T00:00:00Z").toLocaleDateString("he-IL", {
      day: "2-digit", month: "2-digit", weekday: "short", timeZone: "UTC",
    });
  }

  function exportExcel() {
    const hasMultipleCompanies = companies.length > 1;
    const headers = ["תאריך", "יום", "תכנון", "בפועל", "%"];
    if (hasMultipleCompanies) {
      for (const co of companies) {
        headers.push(`${co} תכנון`, `${co} בפועל`);
      }
    }
    headers.push("מצטבר תכנון", "מצטבר בפועל", "% מצטבר");

    const csvRows = [headers.join(",")];
    for (const r of enriched) {
      const dow = new Date(r.date + "T00:00:00Z").toLocaleDateString("he-IL", { weekday: "long", timeZone: "UTC" });
      const cols: (string | number)[] = [r.date, dow, r.allocated, r.actual, r.pct + "%"];
      if (hasMultipleCompanies) {
        for (const co of companies) {
          const pc = r.perCompany.find((p) => p.companyName === co);
          cols.push(pc?.allocated ?? 0, pc?.actual ?? 0);
        }
      }
      cols.push(r.cumAlloc, r.cumActual, r.cumPct + "%");
      csvRows.push(cols.join(","));
    }
    csvRows.push("");
    csvRows.push(`סה"כ,,${grandAlloc},${grandActual},${grandPct}%`);

    const BOM = "﻿";
    const blob = new Blob([BOM + csvRows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `דוח-הצלבה-${employmentName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className={`rounded-lg px-4 py-2 text-center border ${grandPct >= 90 ? "bg-emerald-50 border-emerald-200" : grandPct >= 70 ? "bg-amber-50 border-amber-200" : "bg-rose-50 border-rose-200"}`}>
            <div className={`text-2xl font-bold ${grandPct >= 90 ? "text-emerald-700" : grandPct >= 70 ? "text-amber-700" : "text-rose-700"}`}>{grandPct}%</div>
            <div className="text-[10px] text-slate-500">ביצוע מצטבר</div>
          </div>
          <div className="text-sm text-slate-600">
            <div>{grandActual} / {grandAlloc} ימי נוכחות</div>
            <div className="text-xs text-slate-400">מתוך {totalDays} ימי מילואים מתוכננים</div>
          </div>
        </div>
        <Button type="button" onClick={exportExcel} variant="secondary">
          📥 ייצוא לאקסל
        </Button>
      </div>

      {/* Per-company summary */}
      {companies.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {companies.map((coName) => {
            const coAlloc = enriched.reduce((s, r) => s + (r.perCompany.find((p) => p.companyName === coName)?.allocated ?? 0), 0);
            const coActual = enriched.reduce((s, r) => s + (r.perCompany.find((p) => p.companyName === coName)?.actual ?? 0), 0);
            const coPct = coAlloc > 0 ? Math.round((coActual / coAlloc) * 100) : 0;
            return (
              <div key={coName} className={`rounded-lg p-3 border border-slate-200 ${coPct >= 90 ? "bg-emerald-50" : coPct >= 70 ? "bg-amber-50" : "bg-rose-50"}`}>
                <div className="font-medium text-sm text-slate-800">{coName}</div>
                <div className="flex gap-4 mt-1 text-xs">
                  <span className={coPct >= 90 ? "text-emerald-600" : coPct >= 70 ? "text-amber-600" : "text-rose-600"}>
                    {coActual}/{coAlloc} ({coPct}%)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Card className="p-2">
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-2 py-1.5 border border-slate-200 text-right sticky right-0 bg-slate-50 z-10">תאריך</th>
                <th className="px-2 py-1.5 border border-slate-200 text-center">תכנון</th>
                <th className="px-2 py-1.5 border border-slate-200 text-center">בפועל</th>
                <th className="px-2 py-1.5 border border-slate-200 text-center">%</th>
                {companies.length > 1 && companies.map((co) => (
                  <th key={co} className="px-2 py-1.5 border border-slate-200 text-center bg-blue-50" colSpan={2}>
                    {co}
                  </th>
                ))}
                <th className="px-2 py-1.5 border border-slate-200 text-center bg-slate-100">מצטבר תכנון</th>
                <th className="px-2 py-1.5 border border-slate-200 text-center bg-slate-100">מצטבר בפועל</th>
                <th className="px-2 py-1.5 border border-slate-200 text-center bg-slate-100">% מצטבר</th>
              </tr>
              {companies.length > 1 && (
                <tr className="bg-blue-50/50">
                  <th className="border border-slate-200 sticky right-0 bg-white z-10" />
                  <th className="border border-slate-200" />
                  <th className="border border-slate-200" />
                  <th className="border border-slate-200" />
                  {companies.map((co) => (
                    <React.Fragment key={co}>
                      <th className="px-1 py-0.5 border border-slate-200 text-center text-[10px] text-blue-600">תכנון</th>
                      <th className="px-1 py-0.5 border border-slate-200 text-center text-[10px] text-blue-600">בפועל</th>
                    </React.Fragment>
                  ))}
                  <th className="border border-slate-200" />
                  <th className="border border-slate-200" />
                  <th className="border border-slate-200" />
                </tr>
              )}
            </thead>
            <tbody>
              {enriched.map((r) => {
                const isToday = r.date === today;
                const pctColor = r.pct >= 90 ? "text-emerald-600" : r.pct >= 70 ? "text-amber-600" : "text-rose-600";
                const cumColor = r.cumPct >= 90 ? "text-emerald-600" : r.cumPct >= 70 ? "text-amber-600" : "text-rose-600";
                return (
                  <tr key={r.date} className={isToday ? "bg-blue-50 font-semibold" : "hover:bg-slate-50"}>
                    <td className="px-2 py-1 border border-slate-200 whitespace-nowrap sticky right-0 bg-white z-10">
                      {isToday && "▸ "}{formatDate(r.date)}
                    </td>
                    <td className="px-2 py-1 border border-slate-200 text-center">{r.allocated}</td>
                    <td className="px-2 py-1 border border-slate-200 text-center">{r.actual}</td>
                    <td className={`px-2 py-1 border border-slate-200 text-center font-semibold ${pctColor}`}>{r.pct}%</td>
                    {companies.length > 1 && r.perCompany.map((pc) => (
                      <React.Fragment key={pc.companyName}>
                        <td className="px-2 py-1 border border-slate-200 text-center text-slate-500">{pc.allocated}</td>
                        <td className="px-2 py-1 border border-slate-200 text-center">{pc.actual}</td>
                      </React.Fragment>
                    ))}
                    <td className="px-2 py-1 border border-slate-200 text-center text-slate-500">{r.cumAlloc}</td>
                    <td className="px-2 py-1 border border-slate-200 text-center text-slate-500">{r.cumActual}</td>
                    <td className={`px-2 py-1 border border-slate-200 text-center font-semibold ${cumColor}`}>{r.cumPct}%</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-semibold">
                <td className="px-2 py-1.5 border border-slate-200 sticky right-0 bg-slate-100 z-10">סה״כ</td>
                <td className="px-2 py-1.5 border border-slate-200 text-center">{grandAlloc}</td>
                <td className="px-2 py-1.5 border border-slate-200 text-center">{grandActual}</td>
                <td className={`px-2 py-1.5 border border-slate-200 text-center ${grandPct >= 90 ? "text-emerald-600" : grandPct >= 70 ? "text-amber-600" : "text-rose-600"}`}>{grandPct}%</td>
                {companies.length > 1 && companies.map((co) => {
                  const coAlloc = enriched.reduce((s, r2) => s + (r2.perCompany.find((p) => p.companyName === co)?.allocated ?? 0), 0);
                  const coActual = enriched.reduce((s, r2) => s + (r2.perCompany.find((p) => p.companyName === co)?.actual ?? 0), 0);
                  return (
                    <React.Fragment key={co}>
                      <td className="px-2 py-1.5 border border-slate-200 text-center">{coAlloc}</td>
                      <td className="px-2 py-1.5 border border-slate-200 text-center">{coActual}</td>
                    </React.Fragment>
                  );
                })}
                <td className="px-2 py-1.5 border border-slate-200 text-center" colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
