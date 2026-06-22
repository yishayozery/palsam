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

  const existingMap = new Map<string, Set<string>>();
  for (const e of existing) {
    if (!existingMap.has(e.itemTypeId)) existingMap.set(e.itemTypeId, new Set());
    existingMap.get(e.itemTypeId)!.add(e.licenseTypeId);
  }

  function startEdit(vehicleTypeId: string) {
    setEditingVehicle(vehicleTypeId);
    setSelected(new Set(existingMap.get(vehicleTypeId) || []));
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
    return (
      <div className="text-sm text-slate-500 p-4 bg-white rounded-xl border border-slate-200">
        לא נמצאו סוגי רכב במערכת. הגדר סוגי רכב בקטלוג.
      </div>
    );
  }

  if (licenseTypes.length === 0) {
    return (
      <div className="text-sm text-slate-500 p-4 bg-white rounded-xl border border-slate-200">
        לא הוגדרו סוגי הרשאות נהיגה. עבור לטאב &quot;סוגי הרשאות&quot; והוסף סוגים.
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-slate-500 mb-3">
        שיוך סוגי הרשאות נהיגה לסוגי רכב — הגדרה זו קובעת איזו הרשאה נדרשת לנהיגה בסוג רכב מסוים.
      </p>
      <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky right-0 z-10 bg-slate-50 px-3 py-2 text-right font-medium text-slate-600 border-b min-w-[160px]">
                סוג רכב
              </th>
              {licenseTypes.map((lt) => (
                <th key={lt.id} className="px-3 py-2 text-center font-medium text-slate-600 border-b min-w-[90px]">
                  {lt.name}
                </th>
              ))}
              {canEdit && <th className="px-2 py-2 border-b" />}
            </tr>
          </thead>
          <tbody>
            {vehicleTypes.map((vt) => {
              const isEditing = editingVehicle === vt.id;
              const currentLicenses = existingMap.get(vt.id) || new Set();

              return (
                <tr key={vt.id} className={isEditing ? "bg-blue-50/50" : "hover:bg-slate-50"}>
                  <td className="sticky right-0 z-10 bg-white px-3 py-2 border-b font-medium text-slate-700 whitespace-nowrap">
                    {vt.name}
                  </td>
                  {licenseTypes.map((lt) => {
                    if (isEditing) {
                      return (
                        <td key={lt.id} className="px-3 py-2 border-b text-center">
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
                    return (
                      <td key={lt.id} className="px-3 py-2 border-b text-center">
                        {currentLicenses.has(lt.id) ? (
                          <span className="text-green-600 font-bold">✓</span>
                        ) : (
                          <span className="text-slate-200">-</span>
                        )}
                      </td>
                    );
                  })}
                  {canEdit && (
                    <td className="px-2 py-2 border-b text-center">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleSave(vt.id)}
                            disabled={pending}
                            className="px-2 py-1 bg-blue-600 text-white rounded text-xs disabled:opacity-50"
                          >
                            {pending ? "..." : "שמור"}
                          </button>
                          <button
                            onClick={() => setEditingVehicle(null)}
                            className="px-2 py-1 bg-slate-200 rounded text-xs"
                          >
                            ביטול
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(vt.id)}
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
    </div>
  );
}
