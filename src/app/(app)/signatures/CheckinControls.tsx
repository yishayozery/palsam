"use client";

import { useState } from "react";
import { checkinSerial, updatePhysicalLocation } from "./actions";

export default function CheckinControls({
  serialUnitId,
  trackLocation,
  currentLocation,
  statuses,
}: {
  serialUnitId: string;
  trackLocation: boolean;
  currentLocation: string;
  statuses: { id: string; name: string }[];
}) {
  const [showLoc, setShowLoc] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <form action={checkinSerial} className="flex items-center gap-1">
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
        <button
          onClick={() => setShowLoc((v) => !v)}
          className="text-xs text-slate-500 hover:text-slate-800"
        >
          מיקום
        </button>
      )}

      {showLoc && (
        <form action={updatePhysicalLocation} className="flex items-center gap-1">
          <input type="hidden" name="serialUnitId" value={serialUnitId} />
          <input
            name="physicalLocation"
            defaultValue={currentLocation}
            placeholder="רכב צ-12345"
            className="rounded border border-slate-300 px-2 py-1 text-xs w-28"
          />
          <button className="bg-slate-700 text-white rounded-md px-2 py-1 text-xs">שמור</button>
        </form>
      )}
    </div>
  );
}
