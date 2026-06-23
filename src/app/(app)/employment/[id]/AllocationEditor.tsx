"use client";

import React, { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import { saveAllocations } from "../actions";

type Company = { id: string; name: string };

export default function AllocationEditor({
  employmentId,
  companies,
  dates,
  initialAllocations,
  dailyAverage,
  totalDays,
  canManage,
}: {
  employmentId: string;
  companies: Company[];
  dates: string[];
  initialAllocations: Record<string, number>;
  dailyAverage: number | null;
  totalDays: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [allocations, setAllocations] = useState<Record<string, number>>(initialAllocations);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [distMode, setDistMode] = useState<"pct" | "days">("pct");
  const [companyPcts, setCompanyPcts] = useState<Record<string, number>>(() => {
    const even = Math.floor(100 / companies.length);
    const pcts: Record<string, number> = {};
    companies.forEach((c, i) => {
      pcts[c.id] = i === companies.length - 1 ? 100 - even * (companies.length - 1) : even;
    });
    return pcts;
  });
  const [companyDays, setCompanyDays] = useState<Record<string, number>>(() => {
    const perCo = Math.floor(totalDays / companies.length);
    const days: Record<string, number> = {};
    companies.forEach((c, i) => {
      days[c.id] = i === companies.length - 1 ? totalDays - perCo * (companies.length - 1) : perCo;
    });
    return days;
  });

  const getValue = useCallback(
    (companyId: string, date: string) => {
      const key = `${companyId}_${date}`;
      return allocations[key] ?? 0;
    },
    [allocations],
  );

  const setValue = useCallback((companyId: string, date: string, val: number) => {
    const key = `${companyId}_${date}`;
    setAllocations((prev) => ({ ...prev, [key]: val }));
    setSuccess(false);
  }, []);

  const totals = useMemo(() => {
    const byDate: Record<string, number> = {};
    const byCompany: Record<string, number> = {};
    let grand = 0;
    for (const co of companies) {
      for (const dt of dates) {
        const v = getValue(co.id, dt);
        byDate[dt] = (byDate[dt] || 0) + v;
        byCompany[co.id] = (byCompany[co.id] || 0) + v;
        grand += v;
      }
    }
    return { byDate, byCompany, grand };
  }, [companies, dates, getValue]);

  const overage = totals.grand - totalDays;

  function formatDateShort(iso: string) {
    const d = new Date(iso + "T00:00:00Z");
    const day = d.getUTCDate().toString().padStart(2, "0");
    const month = (d.getUTCMonth() + 1).toString().padStart(2, "0");
    const dow = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"][d.getUTCDay()];
    return { label: `${day}/${month}`, dow };
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess(false);

    const entries: { companyId: string; date: string; allocated: number }[] = [];
    for (const co of companies) {
      for (const dt of dates) {
        const v = getValue(co.id, dt);
        if (v > 0) {
          entries.push({ companyId: co.id, date: dt, allocated: v });
        }
      }
    }

    const fd = new FormData();
    fd.set("employmentId", employmentId);
    fd.set("allocations", JSON.stringify(entries));

    const res = await saveAllocations(fd);
    setSaving(false);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccess(true);
      router.refresh();
    }
  }

  function fillAverage() {
    if (!dailyAverage) return;
    const perCompany = Math.ceil(dailyAverage / companies.length);
    const next: Record<string, number> = {};
    for (const co of companies) {
      for (const dt of dates) {
        next[`${co.id}_${dt}`] = perCompany;
      }
    }
    setAllocations(next);
    setSuccess(false);
  }

  function distributeByPercentage() {
    const pctSum = Object.values(companyPcts).reduce((s, v) => s + v, 0);
    if (pctSum === 0) return;
    const dailyTotal = Math.ceil(totalDays / dates.length);
    const next: Record<string, number> = {};
    for (const co of companies) {
      const pct = companyPcts[co.id] || 0;
      const perDay = Math.round((dailyTotal * pct) / pctSum);
      for (const dt of dates) {
        next[`${co.id}_${dt}`] = perDay;
      }
    }
    setAllocations(next);
    setSuccess(false);
  }

  function distributeByDays() {
    const next: Record<string, number> = {};
    for (const co of companies) {
      const coTotal = companyDays[co.id] || 0;
      const perDay = dates.length > 0 ? Math.ceil(coTotal / dates.length) : 0;
      for (const dt of dates) {
        next[`${co.id}_${dt}`] = perDay;
      }
    }
    setAllocations(next);
    setSuccess(false);
  }

  function distribute() {
    if (distMode === "pct") distributeByPercentage();
    else distributeByDays();
  }

  function setCompanyTotal(companyId: string, newTotal: number) {
    const perDay = dates.length > 0 ? Math.ceil(newTotal / dates.length) : 0;
    setAllocations((prev) => {
      const next = { ...prev };
      for (const dt of dates) {
        next[`${companyId}_${dt}`] = perDay;
      }
      return next;
    });
    setSuccess(false);
  }

  return (
    <Card className="p-2 md:p-4">
      {canManage && (
        <div className="space-y-3 mb-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "שומר..." : "שמור הקצאות"}
            </Button>
            {dailyAverage !== null && (
              <Button type="button" variant="secondary" onClick={fillAverage}>
                מלא ממוצע ({dailyAverage} ליום)
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={distribute}>
              חלק {distMode === "pct" ? "לפי אחוזים" : "לפי ימים"}
            </Button>
            {error && <span className="text-sm text-rose-600">{error}</span>}
            {success && <span className="text-sm text-emerald-600">נשמר בהצלחה</span>}
          </div>

          {/* Distribution controls — toggle between % and days */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-semibold text-blue-800">חלוקה ({totalDays} ימי מילואים)</span>
              <div className="flex rounded-md overflow-hidden border border-blue-300 text-xs">
                <button
                  type="button"
                  onClick={() => setDistMode("pct")}
                  className={`px-3 py-1 transition ${distMode === "pct" ? "bg-blue-600 text-white" : "bg-white text-blue-700 hover:bg-blue-100"}`}
                >
                  אחוזים %
                </button>
                <button
                  type="button"
                  onClick={() => setDistMode("days")}
                  className={`px-3 py-1 transition ${distMode === "days" ? "bg-blue-600 text-white" : "bg-white text-blue-700 hover:bg-blue-100"}`}
                >
                  מספר ימים
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              {companies.map((co) => {
                const pctSum = Object.values(companyPcts).reduce((s, v) => s + v, 0);
                const daysSum = Object.values(companyDays).reduce((s, v) => s + v, 0);
                return (
                  <div key={co.id} className="flex flex-col items-center">
                    <label className="text-[10px] text-slate-600 mb-0.5">{co.name}</label>
                    {distMode === "pct" ? (
                      <>
                        <div className="flex items-center gap-1">
                          <input
                            type="number" min={0} max={100}
                            value={companyPcts[co.id] || 0}
                            onChange={(e) => setCompanyPcts((prev) => ({ ...prev, [co.id]: parseInt(e.target.value, 10) || 0 }))}
                            className="w-14 text-center rounded border border-blue-300 px-1 py-1 text-sm"
                          />
                          <span className="text-[10px] text-slate-500">%</span>
                        </div>
                        <span className="text-[10px] text-blue-600 mt-0.5">
                          {Math.round((totalDays * (companyPcts[co.id] || 0)) / Math.max(1, pctSum))} ימים
                        </span>
                      </>
                    ) : (
                      <>
                        <input
                          type="number" min={0}
                          value={companyDays[co.id] || 0}
                          onChange={(e) => setCompanyDays((prev) => ({ ...prev, [co.id]: parseInt(e.target.value, 10) || 0 }))}
                          className="w-16 text-center rounded border border-blue-300 px-1 py-1 text-sm"
                        />
                        <span className="text-[10px] text-blue-600 mt-0.5">
                          {pctSum > 0 ? Math.round(((companyDays[co.id] || 0) / Math.max(1, daysSum)) * 100) : 0}%
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
              <div className="flex flex-col items-center text-xs text-slate-500">
                <span>סה״כ:</span>
                {distMode === "pct" ? (
                  <span>{Object.values(companyPcts).reduce((s, v) => s + v, 0)}%</span>
                ) : (
                  <span className={Object.values(companyDays).reduce((s, v) => s + v, 0) !== totalDays ? "text-rose-600 font-semibold" : ""}>
                    {Object.values(companyDays).reduce((s, v) => s + v, 0)} / {totalDays}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Overage warning */}
          {overage > 0 && (
            <div className="bg-rose-50 border border-rose-300 rounded-lg p-2 text-sm text-rose-800">
              ⚠️ חריגה: סה״כ הקצאות ({totals.grand}) חורג מ-{totalDays} ימי מילואים ב-<strong>{overage}</strong> ימים
            </div>
          )}
          {overage < 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-sm text-amber-700">
              נותרו {Math.abs(overage)} ימים לא מוקצים מתוך {totalDays}
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="text-sm border-collapse min-w-max">
          <thead>
            <tr>
              <th className="sticky right-0 z-10 bg-slate-100 px-3 py-2 text-right border border-slate-200 font-semibold text-slate-600 min-w-[120px]">
                פלוגה
              </th>
              {dates.map((dt) => {
                const { label, dow } = formatDateShort(dt);
                const isFriday = new Date(dt + "T00:00:00Z").getUTCDay() === 5;
                const isSaturday = new Date(dt + "T00:00:00Z").getUTCDay() === 6;
                return (
                  <th
                    key={dt}
                    className={`px-1 py-1 text-center border border-slate-200 text-xs whitespace-nowrap ${
                      isFriday || isSaturday ? "bg-amber-50" : "bg-slate-50"
                    }`}
                  >
                    <div>{dow}</div>
                    <div>{label}</div>
                  </th>
                );
              })}
              <th className="px-3 py-2 text-center border border-slate-200 bg-slate-100 font-semibold text-slate-600">
                סה״כ
              </th>
              {canManage && (
                <th className="px-2 py-2 text-center border border-slate-200 bg-blue-50 font-semibold text-blue-700 text-xs">
                  עריכת סה״כ
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {companies.map((co) => (
              <tr key={co.id}>
                <td className="sticky right-0 z-10 bg-white px-3 py-1 border border-slate-200 font-medium text-slate-700 whitespace-nowrap">
                  {co.name}
                </td>
                {dates.map((dt) => {
                  const val = getValue(co.id, dt);
                  return (
                    <td key={dt} className="px-0 py-0 border border-slate-200">
                      {canManage ? (
                        <input
                          type="number"
                          min={0}
                          value={val || ""}
                          onChange={(e) =>
                            setValue(co.id, dt, parseInt(e.target.value, 10) || 0)
                          }
                          className="w-14 text-center py-1 text-sm border-0 focus:ring-2 focus:ring-blue-300 rounded"
                        />
                      ) : (
                        <span className="block text-center py-1 text-sm">{val || "-"}</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-1 border border-slate-200 text-center font-semibold bg-slate-50">
                  {totals.byCompany[co.id] || 0}
                </td>
                {canManage && (
                  <td className="px-0 py-0 border border-slate-200 bg-blue-50/50">
                    <input
                      type="number" min={0}
                      value={totals.byCompany[co.id] || ""}
                      onChange={(e) => setCompanyTotal(co.id, parseInt(e.target.value, 10) || 0)}
                      className="w-16 text-center py-1 text-sm border-0 bg-transparent focus:ring-2 focus:ring-blue-300 rounded font-semibold text-blue-700"
                    />
                  </td>
                )}
              </tr>
            ))}
            <tr className="bg-slate-100 font-semibold">
              <td className="sticky right-0 z-10 bg-slate-100 px-3 py-2 border border-slate-200 text-slate-700">
                סה״כ יומי
              </td>
              {dates.map((dt) => (
                <td key={dt} className="px-1 py-2 border border-slate-200 text-center text-xs">
                  {totals.byDate[dt] || 0}
                </td>
              ))}
              <td className={`px-3 py-2 border border-slate-200 text-center ${overage > 0 ? "text-rose-700 bg-rose-50" : "text-blue-700"}`}>
                {totals.grand}
                {overage !== 0 && (
                  <div className={`text-[10px] ${overage > 0 ? "text-rose-600" : "text-amber-600"}`}>
                    ({overage > 0 ? "+" : ""}{overage})
                  </div>
                )}
              </td>
              {canManage && <td className="border border-slate-200" />}
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
