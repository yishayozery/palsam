"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { checkinSerial } from "./actions";
import { setUnitEquipmentLocation } from "../locations/actions";

type Loc = { id: string; name: string; isVehicle: boolean };

export default function CheckinControls({
  serialUnitId, trackLocation, currentLocationId, equipmentLocations = [], statuses,
}: {
  serialUnitId: string;
  trackLocation: boolean;
  currentLocationId: string | null;
  equipmentLocations?: Loc[];
  statuses: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [showLoc, setShowLoc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveLocation(equipmentLocationId: string) {
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("serialUnitId", serialUnitId);
      if (equipmentLocationId) fd.append("equipmentLocationId", equipmentLocationId);
      const res = await setUnitEquipmentLocation(fd);
      if (res?.error) setError(res.error);
      else { setShowLoc(false); router.refresh(); }
    } finally { setBusy(false); }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <form action={async (fd: FormData) => {
        const res = await checkinSerial(fd);
        if (res?.error) setError(res.error);
        else router.refresh();
      }} className="flex items-center gap-1">
        <input type="hidden" name="serialUnitId" value={serialUnitId} />
        <select name="statusId" className="rounded border border-slate-300 px-1.5 py-1 text-xs">
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button className="bg-emerald-600 text-white rounded-md px-2.5 py-1 text-xs hover:bg-emerald-700 whitespace-nowrap">
          ✓ התקבל וזוכה
        </button>
      </form>

      {trackLocation && (
        <button onClick={() => setShowLoc((v) => !v)}
          className="text-xs text-slate-500 hover:text-slate-800">
          📍 מיקום
        </button>
      )}

      {showLoc && (
        equipmentLocations.length === 0 ? (
          <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            ⚠️ לא הוגדרו מיקומים. <a href="/locations?tab=equipment" className="underline">הגדר עכשיו</a>
          </span>
        ) : (
          <select value={currentLocationId ?? ""}
            onChange={(e) => saveLocation(e.target.value)}
            disabled={busy}
            className="rounded border border-slate-300 px-2 py-1 text-xs">
            <option value="">— ללא מיקום —</option>
            {equipmentLocations.map((l) => (
              <option key={l.id} value={l.id}>{l.isVehicle ? "🚙" : "📍"} {l.name}</option>
            ))}
          </select>
        )
      )}
      {error && <span className="text-xs text-rose-700">{error}</span>}
    </div>
  );
}
