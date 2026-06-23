"use client";

import React from "react";
import { Card, StatCard } from "@/components/ui";

type DashboardEntry = {
  employmentName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  allocations: { companyId: string; companyName: string; date: string; allocated: number }[];
  attendanceCounts: { companyId: string; date: string; count: number }[];
};

function toneForPercent(pct: number): "emerald" | "amber" | "rose" {
  if (pct >= 90) return "emerald";
  if (pct >= 70) return "amber";
  return "rose";
}

function colorClass(pct: number): string {
  if (pct >= 90) return "text-emerald-600";
  if (pct >= 70) return "text-amber-600";
  return "text-rose-600";
}

function bgClass(pct: number): string {
  if (pct >= 90) return "bg-emerald-50";
  if (pct >= 70) return "bg-amber-50";
  return "bg-rose-50";
}

export default function EmploymentDashboard({ data, today }: { data: DashboardEntry[]; today: string }) {

  return (
    <div className="space-y-4">
      {data.map((entry, idx) => {
        const todayAllocations = entry.allocations.filter((a) => a.date === today);
        const todayAllocatedTotal = todayAllocations.reduce((s, a) => s + a.allocated, 0);
        const todayActualTotal = entry.attendanceCounts
          .filter((c) => c.date === today)
          .reduce((s, c) => s + c.count, 0);
        const todayPct = todayAllocatedTotal > 0
          ? Math.round((todayActualTotal / todayAllocatedTotal) * 100)
          : 0;

        const pastAllocations = entry.allocations.filter((a) => a.date <= today);
        const cumulativeAllocated = pastAllocations.reduce((s, a) => s + a.allocated, 0);
        const cumulativeActual = entry.attendanceCounts.reduce((s, c) => s + c.count, 0);
        const cumulativePct = cumulativeAllocated > 0
          ? Math.round((cumulativeActual / cumulativeAllocated) * 100)
          : 0;

        const totalAllocated = entry.allocations.reduce((s, a) => s + a.allocated, 0);
        const overage = totalAllocated - entry.totalDays;

        const companyIds = [...new Set(entry.allocations.map((a) => a.companyId))];
        const companyMap = new Map<string, string>();
        for (const a of entry.allocations) companyMap.set(a.companyId, a.companyName);

        const companyBreakdown = companyIds.map((cid) => {
          const todayAlloc = todayAllocations
            .filter((a) => a.companyId === cid)
            .reduce((s, a) => s + a.allocated, 0);
          const todayAct = entry.attendanceCounts
            .filter((c) => c.companyId === cid && c.date === today)
            .reduce((s, c) => s + c.count, 0);
          const cumAlloc = pastAllocations
            .filter((a) => a.companyId === cid)
            .reduce((s, a) => s + a.allocated, 0);
          const cumAct = entry.attendanceCounts
            .filter((c) => c.companyId === cid)
            .reduce((s, c) => s + c.count, 0);
          const companyTotalAlloc = entry.allocations
            .filter((a) => a.companyId === cid)
            .reduce((s, a) => s + a.allocated, 0);

          return {
            name: companyMap.get(cid) || cid,
            todayPct: todayAlloc > 0 ? Math.round((todayAct / todayAlloc) * 100) : 0,
            todayAct,
            todayAlloc,
            cumPct: cumAlloc > 0 ? Math.round((cumAct / cumAlloc) * 100) : 0,
            cumAct,
            cumAlloc,
            companyTotalAlloc,
          };
        });

        return (
          <Card key={idx} className="p-4 md:p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">{entry.employmentName}</h3>

            {/* Overage warning */}
            {overage > 0 && (
              <div className="bg-rose-50 border border-rose-300 rounded-lg p-2 text-sm text-rose-800 mb-4">
                ⚠️ חריגה: סה״כ הקצאות ({totalAllocated}) חורג מ-{entry.totalDays} ימי מילואים ב-<strong>{overage}</strong> ימים
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatCard
                label="נוכחות היום"
                value={`${todayPct}%`}
                hint={`${todayActualTotal} / ${todayAllocatedTotal} אושרו`}
                tone={toneForPercent(todayPct)}
              />
              <StatCard
                label="מצטבר"
                value={`${cumulativePct}%`}
                hint={`${cumulativeActual} / ${cumulativeAllocated} ימי מילואים`}
                tone={toneForPercent(cumulativePct)}
              />
              <StatCard
                label="סה״כ מתוכננים"
                value={entry.totalDays}
                hint={`הוקצו: ${totalAllocated}${overage > 0 ? ` (+${overage} חריגה)` : ""}`}
                tone={overage > 0 ? "rose" : "slate"}
              />
              <StatCard
                label="ימי מילואים שנוצלו"
                value={cumulativeActual}
                hint={`${Math.round((cumulativeActual / entry.totalDays) * 100)}% מהמכסה`}
                tone="blue"
              />
            </div>

            {companyBreakdown.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-600 mb-2">פירוט לפי פלוגה</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {companyBreakdown.map((co) => (
                    <div
                      key={co.name}
                      className={`rounded-lg p-3 border ${bgClass(co.cumPct)} border-slate-200`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-slate-800">{co.name}</span>
                        <span className="text-[10px] text-slate-500">מכסה: {co.companyTotalAlloc}</span>
                      </div>
                      <div className="flex gap-4 mt-1 text-xs">
                        <span className={colorClass(co.todayPct)}>
                          היום: {co.todayAct}/{co.todayAlloc} ({co.todayPct}%)
                        </span>
                        <span className={colorClass(co.cumPct)}>
                          מצטבר: {co.cumAct}/{co.cumAlloc} ({co.cumPct}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
