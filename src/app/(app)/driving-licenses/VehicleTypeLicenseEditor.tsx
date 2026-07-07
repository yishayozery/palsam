"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveVehicleTypeLicenses } from "./actions";

type VehicleType = { id: string; name: string };
type LicenseType = { id: string; name: string };
type Existing = { id: string; itemTypeId: string; licenseTypeId: string };

export default function VehicleTypeLicenseEditor({
  vehicleTypes,
  licenseTypes,
  existing,
  canEdit,
}: {
  vehicleTypes: VehicleType[];
  licenseTypes: LicenseType[];
  existing: Existing[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingVehicle, setEditingVehicle] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const licenseById = new Map(licenseTypes.map((lt) => [lt.id, lt]));
  const existingMap = new Map<string, string[]>();
  for (const e of existing) {
    const arr = existingMap.get(e.itemTypeId) ?? [];
    arr.push(e.licenseTypeId);
    existingMap.set(e.itemTypeId, arr);
  }

  function startEdit(vehicleTypeId: string) {
    setEditingVehicle(vehicleTypeId);
    setSelected(new Set(existingMap.get(vehicleTypeId) ?? []));
  }

  function toggle(ltId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ltId)) next.delete(ltId); else next.add(ltId);
      return next;
    });
  }

  function handleSave(vehicleTypeId: string) {
    const fd = new FormData();
    fd.set("itemTypeId", vehicleTypeId);
    selected.forEach((ltId) => fd.append("licenseTypeId", ltId));
    startTransition(async () => {
      await saveVehicleTypeLicenses(fd);
      setEditingVehicle(null);
      router.refresh();
    });
  }

  if (vehicleTypes.length === 0) {
    return <div className="text-sm text-slate-500 p-4 bg-white rounded-xl border border-slate-200">לא נמצאו סוגי רכב במערכת. הגדר סוגי רכב בקטלוג.</div>;
  }
  if (licenseTypes.length === 0) {
    return <div className="text-sm text-slate-500 p-4 bg-white rounded-xl border border-slate-200">לא הוגדרו סוגי הרשאות נהיגה. עבור לטאב &quot;סוגי הרשאות&quot; והוסף סוגים.</div>;
  }

  const shown = search.trim()
    ? vehicleTypes.filter((vt) => vt.name.includes(search.trim()))
    : vehicleTypes;

  return (
    <div>
      <p className="text-sm text-slate-500 mb-3">
        לכל סוג רכב — אילו הרשאות נהיגה נדרשות כדי לנהוג בו. נהג יסומן כ&quot;מוסמך&quot; רק אם ברשותו כל ההרשאות שמסומנות כאן.
      </p>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 חיפוש סוג רכב..."
        className="w-full sm:max-w-xs border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3" />

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((vt) => {
          const isEditing = editingVehicle === vt.id;
          const reqIds = existingMap.get(vt.id) ?? [];
          const reqNames = reqIds.map((id) => licenseById.get(id)?.name).filter(Boolean) as string[];

          return (
            <div key={vt.id} className={`rounded-xl border p-3 ${isEditing ? "border-blue-300 bg-blue-50/40" : "border-slate-200 bg-white"}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="font-bold text-sm text-slate-800 flex items-center gap-1.5">🚗 {vt.name}</div>
                {canEdit && !isEditing && (
                  <button onClick={() => startEdit(vt.id)} className="text-xs text-blue-600 hover:underline shrink-0">✏️ עריכה</button>
                )}
              </div>

              {isEditing ? (
                <>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {licenseTypes.map((lt) => {
                      const on = selected.has(lt.id);
                      return (
                        <button key={lt.id} onClick={() => toggle(lt.id)} type="button"
                          className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${on ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-500 border-slate-300 hover:border-slate-400"}`}>
                          {on ? "✓ " : ""}{lt.name}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => handleSave(vt.id)} disabled={pending}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium disabled:opacity-50">{pending ? "..." : "💾 שמור"}</button>
                    <button onClick={() => setEditingVehicle(null)} className="px-3 py-1 bg-slate-200 rounded-lg text-xs">ביטול</button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {reqNames.length > 0 ? (
                    reqNames.map((n, i) => (
                      <span key={i} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5">{n}</span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400">— לא הוגדרה הרשאה נדרשת —</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {shown.length === 0 && <div className="text-sm text-slate-400 p-4 text-center">לא נמצאו סוגי רכב תואמים לחיפוש.</div>}
    </div>
  );
}
