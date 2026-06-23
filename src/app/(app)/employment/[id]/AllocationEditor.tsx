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
  canManage,
}: {
  employmentId: string;
  companies: Company[];
  dates: string[];
  initialAllocations: Record<string, number>;
  dailyAverage: number | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [allocations, setAllocations] = useState<Record<string, number>>(initialAllocations);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

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

  return (
    <Card className="p-2 md:p-4">
      {canManage && (
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "שומר..." : "שמור הקצאות"}
          </Button>
          {dailyAverage !== null && (
            <Button type="button" variant="secondary" onClick={fillAverage}>
              מלא ממוצע ({dailyAverage} ליום)
            </Button>
          )}
          {error && <span className="text-sm text-rose-600">{error}</span>}
          {success && <span className="text-sm text-emerald-600">נשמר בהצלחה</span>}
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
              </tr>
            ))}
            <tr className="bg-slate-100 font-semibold">
              <td className="sticky right-0 z-10 bg-slate-100 px-3 py-2 border border-slate-200 text-slate-700">
                סה״כ
              </td>
              {dates.map((dt) => (
                <td key={dt} className="px-1 py-2 border border-slate-200 text-center text-xs">
                  {totals.byDate[dt] || 0}
                </td>
              ))}
              <td className="px-3 py-2 border border-slate-200 text-center text-blue-700">
                {totals.grand}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
