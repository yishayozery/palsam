"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEscClose } from "@/lib/useEscClose";
import { saveEquipmentLocation, deleteEquipmentLocation } from "../../locations/actions";

type Loc = {
  id: string; name: string;
  vehicleSerialUnitId: string | null;
  vehicleSerialNumber: string | null;
  unitsCount: number;
};
type Vehicle = { id: string; serialNumber: string; itemName: string };

export default function ManageLocationsModal({
  holderName, locations, vehicles,
}: {
  holderName: string;
  locations: Loc[];
  vehicles: Vehicle[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newVehicleId, setNewVehicleId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editVehicleId, setEditVehicleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEscClose(open, () => setOpen(false));

  async function add() {
    if (!newName.trim()) { setError("נדרש שם"); return; }
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("name", newName.trim());
      if (newVehicleId) fd.append("vehicleSerialUnitId", newVehicleId);
      const res = await saveEquipmentLocation(fd);
      if (res?.error) { setError(res.error); return; }
      setNewName(""); setNewVehicleId(""); setAdding(false);
      router.refresh();
    } finally { setBusy(false); }
  }

  async function save(id: string) {
    if (!editName.trim()) { setError("נדרש שם"); return; }
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("id", id);
      fd.append("name", editName.trim());
      if (editVehicleId) fd.append("vehicleSerialUnitId", editVehicleId);
      const res = await saveEquipmentLocation(fd);
      if (res?.error) { setError(res.error); return; }
      setEditingId(null);
      router.refresh();
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("למחוק את המיקום? היחידות שמסומנות בו יאבדו את ההצבעה.")) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("id", id);
      const res = await deleteEquipmentLocation(fd);
      if (res?.error) { setError(res.error); return; }
      router.refresh();
    } finally { setBusy(false); }
  }

  const vehicleIdsAsLoc = new Set(locations.filter((l) => l.vehicleSerialUnitId).map((l) => l.vehicleSerialUnitId));
  const unlinked = vehicles.filter((v) => !vehicleIdsAsLoc.has(v.id));

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="bg-white border border-slate-300 text-slate-700 rounded-lg px-3 py-2 text-xs hover:bg-slate-50">
        ⚙️ הגדר מיקומים
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-4" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white p-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg">⚙️ ניהול מיקומי ציוד</h3>
            <p className="text-xs text-blue-100 mt-0.5">{holderName} — אוהלים, רכבים, ערמות</p>
          </div>
          <button onClick={() => setOpen(false)} className="text-blue-100 hover:text-white text-2xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
            💡 מיקומי הציוד שלך — אוהל מ"כ, ערמה צפונית, רכב צ-12345 וכו'.
            רכבי הפלוגה מופיעים אוטומטית כהצעה.
          </div>

          {error && <div className="bg-rose-50 border border-rose-300 rounded-lg p-3 text-sm text-rose-800">⚠️ {error}</div>}

          {!adding ? (
            <button onClick={() => { setAdding(true); setError(null); }}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm">
              + הוסף מיקום
            </button>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
              <div className="text-sm font-bold text-slate-700">מיקום חדש</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder='שם המיקום (אוהל מ"כ, ערמה צפונית...)'
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm" autoFocus />
                <select value={newVehicleId} onChange={(e) => setNewVehicleId(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="">— לא רכב —</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>🚙 {v.itemName} · {v.serialNumber}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={add} disabled={busy}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-1.5 text-sm disabled:opacity-50">שמור</button>
                <button onClick={() => { setAdding(false); setNewName(""); setNewVehicleId(""); setError(null); }}
                  className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm">ביטול</button>
              </div>
            </div>
          )}

          {unlinked.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="text-xs font-bold text-amber-900 mb-2">🚙 רכבים שעדיין לא מוגדרים כמיקומים ({unlinked.length})</div>
              <div className="flex flex-wrap gap-2">
                {unlinked.map((v) => (
                  <button key={v.id} onClick={async () => {
                    setBusy(true);
                    try {
                      const fd = new FormData();
                      fd.append("name", `${v.itemName} ${v.serialNumber}`);
                      fd.append("vehicleSerialUnitId", v.id);
                      await saveEquipmentLocation(fd);
                      router.refresh();
                    } finally { setBusy(false); }
                  }} disabled={busy}
                    className="text-xs bg-white hover:bg-amber-100 border border-amber-300 rounded px-2 py-1 disabled:opacity-50">
                    + {v.itemName} {v.serialNumber}
                  </button>
                ))}
              </div>
            </div>
          )}

          {locations.length === 0 ? (
            <div className="text-center text-slate-400 py-10 text-sm border border-dashed border-slate-300 rounded-lg">
              אין מיקומי ציוד מוגדרים. הוסף את הראשון.
            </div>
          ) : (
            <div className="space-y-1.5">
              {locations.map((l) => {
                const isEditing = editingId === l.id;
                return (
                  <div key={l.id} className="bg-white border border-slate-200 rounded-lg p-3 flex items-center gap-3">
                    {isEditing ? (
                      <>
                        <input value={editName} onChange={(e) => setEditName(e.target.value)}
                          className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" />
                        <select value={editVehicleId} onChange={(e) => setEditVehicleId(e.target.value)}
                          className="rounded border border-slate-300 px-2 py-1 text-sm">
                          <option value="">— לא רכב —</option>
                          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.itemName} · {v.serialNumber}</option>)}
                        </select>
                        <button onClick={() => save(l.id)} disabled={busy} className="text-xs bg-emerald-600 text-white rounded px-2 py-1">✓</button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-slate-500">ביטול</button>
                      </>
                    ) : (
                      <>
                        <span className="text-xl">{l.vehicleSerialUnitId ? "🚙" : "📍"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{l.name}</div>
                          {l.vehicleSerialNumber && <div className="text-[11px] text-slate-500 font-mono">רכב: {l.vehicleSerialNumber}</div>}
                        </div>
                        {l.unitsCount > 0 && (
                          <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">{l.unitsCount} פריטים</span>
                        )}
                        <button onClick={() => { setEditingId(l.id); setEditName(l.name); setEditVehicleId(l.vehicleSerialUnitId ?? ""); }}
                          className="text-xs text-slate-500 hover:text-slate-800">✎</button>
                        <button onClick={() => remove(l.id)} className="text-xs text-rose-500 hover:text-rose-700">🗑️</button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 p-3 bg-slate-50 shrink-0">
          <button onClick={() => setOpen(false)} className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm">סגור</button>
        </div>
      </div>
    </div>
  );
}
