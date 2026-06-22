"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSoldierLicenses } from "./actions";

type LicenseType = { id: string; name: string };
type SoldierLicense = { licenseTypeId: string; refresherDate: string | null };
type Soldier = {
  id: string;
  fullName: string;
  companyName: string | null;
  squadName: string | null;
  licenses: SoldierLicense[];
};

export default function LicenseEditor({
  soldiers,
  licenseTypes,
  canEdit,
}: {
  soldiers: Soldier[];
  licenseTypes: LicenseType[];
  canEdit: boolean;
}) {
  const [editingSoldier, setEditingSoldier] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [refreshers, setRefreshers] = useState<Record<string, string>>({});
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
    const r: Record<string, string> = {};
    for (const l of s.licenses) {
      if (l.refresherDate) r[l.licenseTypeId] = l.refresherDate;
    }
    setRefreshers(r);
  }

  function handleSave(soldierId: string) {
    const fd = new FormData();
    fd.set("soldierId", soldierId);
    selected.forEach((ltId) => fd.append("licenseTypeId", ltId));
    for (const [ltId, date] of Object.entries(refreshers)) {
      if (selected.has(ltId) && date) fd.set(`refresher_${ltId}`, date);
    }
    startTransition(async () => {
      await saveSoldierLicenses(fd);
      setEditingSoldier(null);
      router.refresh();
    });
  }

  if (licenseTypes.length === 0) {
    return <div className="text-sm text-slate-500 p-4">לא הוגדרו סוגי הרשאות נהיגה. הוסף סוגים למעלה.</div>;
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
              <th className="px-2 py-2 text-center font-medium text-slate-600 border-b min-w-[100px]">ריענון</th>
              {canEdit && <th className="px-2 py-2 border-b" />}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const isEditing = editingSoldier === s.id;
              const licenseMap = new Map(s.licenses.map((l) => [l.licenseTypeId, l]));
              const hasAnyRefresher = s.licenses.some((l) => l.refresherDate);

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
                    const has = licenseMap.has(lt.id);
                    return (
                      <td key={lt.id} className="px-2 py-2 border-b text-center">
                        {has ? <span className="text-green-600 font-bold">✓</span> : <span className="text-slate-200">-</span>}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 border-b text-center">
                    {isEditing ? (
                      <div className="space-y-1">
                        {licenseTypes.filter((lt) => selected.has(lt.id)).map((lt) => (
                          <div key={lt.id} className="flex items-center gap-1 text-[10px]">
                            <span className="text-slate-500">{lt.name}:</span>
                            <input
                              type="date"
                              value={refreshers[lt.id] || ""}
                              onChange={(e) => setRefreshers((prev) => ({ ...prev, [lt.id]: e.target.value }))}
                              className="border rounded px-1 py-0.5 text-[10px] w-28"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      hasAnyRefresher ? (
                        <div className="space-y-0.5">
                          {s.licenses.filter((l) => l.refresherDate).map((l) => {
                            const lt = licenseTypes.find((t) => t.id === l.licenseTypeId);
                            return (
                              <div key={l.licenseTypeId} className="text-[10px] text-slate-500">
                                {lt?.name}: {new Date(l.refresherDate!).toLocaleDateString("he-IL")}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-slate-200 text-xs">-</span>
                      )
                    )}
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
