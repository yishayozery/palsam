"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSoldierLicenses } from "./actions";

type LicenseType = { id: string; name: string };
type SoldierLicense = { licenseTypeId: string };
type Soldier = {
  id: string;
  fullName: string;
  companyName: string | null;
  squadName: string | null;
  drivingRefresherDate: string | null;
  licenses: SoldierLicense[];
};

function getRefreshStatus(refresherDate: string | null, refreshDays: number): "ok" | "warning" | "expired" | "missing" {
  if (!refresherDate) return "missing";
  const expiry = new Date(refresherDate);
  expiry.setDate(expiry.getDate() + refreshDays);
  const now = new Date();
  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 30) return "warning";
  return "ok";
}

export default function LicenseEditor({
  soldiers,
  licenseTypes,
  canEdit,
  drivingRefreshDays,
}: {
  soldiers: Soldier[];
  licenseTypes: LicenseType[];
  canEdit: boolean;
  drivingRefreshDays: number;
}) {
  const [editingSoldier, setEditingSoldier] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [refresherDate, setRefresherDate] = useState("");
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const router = useRouter();

  const filtered = search.trim()
    ? soldiers.filter((s) =>
        s.fullName.toLowerCase().includes(search.trim().toLowerCase()) ||
        (s.companyName && s.companyName.toLowerCase().includes(search.trim().toLowerCase())) ||
        (s.squadName && s.squadName.toLowerCase().includes(search.trim().toLowerCase()))
      )
    : soldiers;

  function startEdit(s: Soldier) {
    setEditingSoldier(s.id);
    setSelected(new Set(s.licenses.map((l) => l.licenseTypeId)));
    setRefresherDate(s.drivingRefresherDate || "");
  }

  function handleSave(soldierId: string) {
    const fd = new FormData();
    fd.set("soldierId", soldierId);
    selected.forEach((ltId) => fd.append("licenseTypeId", ltId));
    if (refresherDate) fd.set("refresherDate", refresherDate);
    startTransition(async () => {
      await saveSoldierLicenses(fd);
      setEditingSoldier(null);
      router.refresh();
    });
  }

  if (licenseTypes.length === 0) {
    return <div className="text-sm text-slate-500 p-4">לא הוגדרו סוגי הרשאות נהיגה. עבור לטאב &quot;סוגי הרשאות&quot; והוסף סוגים.</div>;
  }

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 חיפוש חייל..."
        className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
      />
      <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky right-0 z-10 bg-slate-50 px-3 py-2 text-right font-medium text-slate-600 border-b min-w-[160px]">חייל</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600 border-b">פלוגה</th>
              {licenseTypes.map((lt) => (
                <th key={lt.id} className="px-2 py-2 text-center font-medium text-slate-600 border-b min-w-[80px]">{lt.name}</th>
              ))}
              <th className="px-2 py-2 text-center font-medium text-slate-600 border-b min-w-[120px]">ריענון נהיגה</th>
              {canEdit && <th className="px-2 py-2 border-b" />}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const isEditing = editingSoldier === s.id;
              const licenseSet = new Set(s.licenses.map((l) => l.licenseTypeId));

              return (
                <tr key={s.id} className={isEditing ? "bg-blue-50/50" : "hover:bg-slate-50"}>
                  <td className="sticky right-0 z-10 bg-white px-3 py-2 border-b font-medium text-slate-700 whitespace-nowrap">
                    {s.fullName}
                  </td>
                  <td className="px-3 py-2 border-b text-xs text-slate-500 whitespace-nowrap">
                    {s.companyName}{s.squadName ? ` / ${s.squadName}` : ""}
                  </td>
                  {licenseTypes.map((lt) => {
                    if (isEditing) {
                      return (
                        <td key={lt.id} className="px-2 py-2 border-b text-center">
                          <input
                            type="checkbox"
                            checked={selected.has(lt.id)}
                            onChange={() => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(lt.id)) next.delete(lt.id);
                                else next.add(lt.id);
                                return next;
                              });
                            }}
                            className="rounded"
                          />
                        </td>
                      );
                    }
                    const has = licenseSet.has(lt.id);
                    return (
                      <td key={lt.id} className="px-2 py-2 border-b text-center">
                        {has ? <span className="text-green-600 font-bold">✓</span> : <span className="text-slate-200">-</span>}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 border-b text-center">
                    {isEditing ? (
                      <input
                        type="date"
                        value={refresherDate}
                        onChange={(e) => setRefresherDate(e.target.value)}
                        className="border rounded px-2 py-1 text-xs w-32"
                      />
                    ) : (() => {
                      const hasLicenses = s.licenses.length > 0;
                      const status = hasLicenses ? getRefreshStatus(s.drivingRefresherDate, drivingRefreshDays) : "ok";
                      if (!hasLicenses) return <span className="text-slate-200 text-xs">-</span>;
                      if (status === "missing") return <span className="text-xs text-rose-600 font-medium">לא בוצע</span>;
                      if (status === "expired") return <span className="text-xs text-rose-600 font-medium">{new Date(s.drivingRefresherDate!).toLocaleDateString("he-IL")} (פג)</span>;
                      if (status === "warning") return <span className="text-xs text-amber-600 font-medium">{new Date(s.drivingRefresherDate!).toLocaleDateString("he-IL")} (עומד לפוג)</span>;
                      return (
                        <span className="text-xs text-slate-600">
                          {new Date(s.drivingRefresherDate!).toLocaleDateString("he-IL")}
                        </span>
                      );
                    })()}
                  </td>
                  {canEdit && (
                    <td className="px-2 py-2 border-b text-center">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleSave(s.id)}
                            disabled={pending}
                            className="px-2 py-1 bg-blue-600 text-white rounded text-xs disabled:opacity-50"
                          >
                            {pending ? "..." : "שמור"}
                          </button>
                          <button
                            onClick={() => setEditingSoldier(null)}
                            className="px-2 py-1 bg-slate-200 rounded text-xs"
                          >
                            ביטול
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(s)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          עריכה
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-slate-400 mt-2">{filtered.length} חיילים</div>
    </div>
  );
}
