"use client";

import { useState, useMemo, useTransition } from "react";
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
  const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
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
  const [onlyDrivers, setOnlyDrivers] = useState(false);
  const router = useRouter();

  const typeName = useMemo(() => new Map(licenseTypes.map((t) => [t.id, t.name])), [licenseTypes]);

  const filtered = useMemo(() => {
    let list = soldiers;
    if (onlyDrivers) list = list.filter((s) => s.licenses.length > 0);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) =>
        s.fullName.toLowerCase().includes(q) ||
        (s.companyName && s.companyName.toLowerCase().includes(q)) ||
        (s.squadName && s.squadName.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [soldiers, search, onlyDrivers]);

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
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 חיפוש חייל / פלוגה..."
          className="flex-1 min-w-[180px] border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-1.5 text-sm text-slate-600 select-none">
          <input type="checkbox" checked={onlyDrivers} onChange={(e) => setOnlyDrivers(e.target.checked)} className="rounded" />
          רק בעלי הרשאה
        </label>
      </div>

      <div className="space-y-2">
        {filtered.map((s) => {
          const isEditing = editingSoldier === s.id;
          const status = s.licenses.length > 0 ? getRefreshStatus(s.drivingRefresherDate, drivingRefreshDays) : null;
          return (
            <div key={s.id} className={`bg-white border rounded-xl p-3 ${isEditing ? "border-blue-300 ring-1 ring-blue-200" : "border-slate-200"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-800">{s.fullName}</div>
                  <div className="text-xs text-slate-500">{s.companyName}{s.squadName ? ` · ${s.squadName}` : ""}</div>
                </div>
                {canEdit && !isEditing && (
                  <button onClick={() => startEdit(s)} className="shrink-0 text-xs bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-lg px-3 py-1.5">
                    ✏️ עריכה
                  </button>
                )}
              </div>

              {!isEditing && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {s.licenses.length === 0 ? (
                    <span className="text-xs text-slate-300">אין הרשאות נהיגה</span>
                  ) : (
                    <>
                      {s.licenses.map((l) => (
                        <span key={l.licenseTypeId} className="text-[11px] bg-slate-100 text-slate-700 rounded px-2 py-0.5">🪪 {typeName.get(l.licenseTypeId)}</span>
                      ))}
                      {status === "missing" && <span className="text-[11px] font-bold bg-rose-100 text-rose-700 rounded px-2 py-0.5">ריענון לא בוצע</span>}
                      {status === "expired" && <span className="text-[11px] font-bold bg-rose-100 text-rose-700 rounded px-2 py-0.5">ריענון פג ({new Date(s.drivingRefresherDate!).toLocaleDateString("he-IL")})</span>}
                      {status === "warning" && <span className="text-[11px] font-bold bg-amber-100 text-amber-700 rounded px-2 py-0.5">עומד לפוג ({new Date(s.drivingRefresherDate!).toLocaleDateString("he-IL")})</span>}
                      {status === "ok" && <span className="text-[11px] text-emerald-600">✓ ריענון {new Date(s.drivingRefresherDate!).toLocaleDateString("he-IL")}</span>}
                    </>
                  )}
                </div>
              )}

              {isEditing && (
                <div className="mt-3 border-t border-slate-100 pt-3 space-y-3">
                  <div>
                    <div className="text-xs font-medium text-slate-500 mb-1.5">הרשאות נהיגה:</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {licenseTypes.map((lt) => {
                        const on = selected.has(lt.id);
                        return (
                          <button key={lt.id} type="button"
                            onClick={() => setSelected((prev) => { const n = new Set(prev); if (n.has(lt.id)) n.delete(lt.id); else n.add(lt.id); return n; })}
                            className={`text-sm rounded-lg border px-3 py-2 text-right transition ${on ? "bg-emerald-50 border-emerald-400 text-emerald-800 font-medium" : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                            {on ? "✓ " : ""}{lt.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">תאריך ריענון אחרון:</span>
                    <input type="date" value={refresherDate} onChange={(e) => setRefresherDate(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                  </label>
                  <div className="flex gap-2">
                    <button onClick={() => handleSave(s.id)} disabled={pending}
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50">
                      {pending ? "שומר..." : "שמור"}
                    </button>
                    <button onClick={() => setEditingSoldier(null)} className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm">ביטול</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <div className="text-sm text-slate-400 p-4 text-center">לא נמצאו חיילים</div>}
      </div>
      <div className="text-xs text-slate-400 mt-2">{filtered.length} חיילים</div>
    </div>
  );
}
