"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { setUnitEquipmentLocation } from "../../locations/actions";

type Item = {
  id: string; itemName: string; sku: string | null;
  serial: string; lotQuantity: number | null; isLot: boolean;
  warehouseType: string | null;
  statusName: string; isWear: boolean; isLoss: boolean;
  signedSoldier: { id: string; name: string; personalNumber: string | null } | null;
  currentHolderName: string | null;
  currentHolderKind: string | null;
  equipmentLocationId: string | null;
  equipmentLocationName: string | null;
};
type Location = {
  id: string; name: string;
  vehicleSerial: string | null;
  isVehicle: boolean;
  count: number;
};

export default function CompanyLocationsClient({
  items, locations, unassignedCount,
  initialQ, initialLoc, initialSigned,
}: {
  items: Item[];
  locations: Location[];
  unassignedCount: number;
  initialQ: string; initialLoc: string; initialSigned: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [locFilter, setLocFilter] = useState(initialLoc);
  const [signedFilter, setSignedFilter] = useState(initialSigned);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; ok: boolean; msg?: string } | null>(null);

  const filtered = useMemo(() => {
    let list = items;
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((i) =>
        i.itemName.toLowerCase().includes(s)
        || (i.sku ?? "").toLowerCase().includes(s)
        || i.serial.toLowerCase().includes(s)
        || (i.signedSoldier?.name ?? "").toLowerCase().includes(s)
        || (i.signedSoldier?.personalNumber ?? "").includes(s)
      );
    }
    if (locFilter === "__unassigned__") {
      list = list.filter((i) => !i.equipmentLocationId);
    } else if (locFilter) {
      list = list.filter((i) => i.equipmentLocationId === locFilter);
    }
    if (signedFilter === "signed") list = list.filter((i) => !!i.signedSoldier);
    else if (signedFilter === "unsigned") list = list.filter((i) => !i.signedSoldier);
    return list;
  }, [items, q, locFilter, signedFilter]);

  // קיבוץ לפי שם הפריט - תצוגה ידידותית
  const grouped = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of filtered) {
      const k = i.itemName;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(i);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  async function changeLocation(itemId: string, locationId: string) {
    setSavingId(itemId);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append("serialUnitId", itemId);
      if (locationId) fd.append("equipmentLocationId", locationId);
      const res = await setUnitEquipmentLocation(fd);
      if (res?.error) {
        setFeedback({ id: itemId, ok: false, msg: res.error });
      } else {
        setFeedback({ id: itemId, ok: true });
        router.refresh();
      }
    } finally {
      setSavingId(null);
      setTimeout(() => setFeedback(null), 2000);
    }
  }

  return (
    <div className="space-y-4">
      {/* פאנל סטטיסטיקות לפי מיקום */}
      <Card className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setLocFilter("")}
            className={`text-xs rounded-full px-3 py-1 ${!locFilter ? "bg-slate-800 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>
            הכל ({items.length})
          </button>
          <button onClick={() => setLocFilter("__unassigned__")}
            className={`text-xs rounded-full px-3 py-1 ${locFilter === "__unassigned__" ? "bg-rose-700 text-white" : "bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200"}`}>
            ⚠️ ללא מיקום ({unassignedCount})
          </button>
          {locations.map((l) => (
            <button key={l.id} onClick={() => setLocFilter(l.id)}
              className={`text-xs rounded-full px-3 py-1 ${locFilter === l.id ? "bg-blue-700 text-white" : "bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200"}`}>
              {l.isVehicle ? "🚙" : "📍"} {l.name} ({l.count})
            </button>
          ))}
        </div>
      </Card>

      {/* פילטרים */}
      <Card className="p-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 שם פריט / SN / חייל / מ.א."
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <select value={signedFilter} onChange={(e) => setSignedFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">הכל</option>
            <option value="signed">🪖 חתום על חייל</option>
            <option value="unsigned">📦 לא חתום (במחסן/פלוגה)</option>
          </select>
          {(q || locFilter || signedFilter) && (
            <button onClick={() => { setQ(""); setLocFilter(""); setSignedFilter(""); }}
              className="rounded-lg border border-slate-300 text-sm hover:bg-slate-50">✕ נקה פילטרים</button>
          )}
          <div className="sm:col-span-3 text-xs text-slate-500">
            {filtered.length} פריטים מתוך {items.length}
          </div>
        </div>
      </Card>

      {/* רשימת פריטים מקובצת */}
      {grouped.length === 0 ? (
        <Card className="p-10 text-center text-slate-400">אין פריטים מתאימים</Card>
      ) : (
        <div className="space-y-3">
          {grouped.map(([itemName, units]) => (
            <Card key={itemName} className="overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-bold text-slate-700">{itemName}</h3>
                <span className="text-xs text-slate-500">{units.length} יחידות</span>
              </div>
              <div className="divide-y divide-slate-100">
                {units.map((u) => {
                  const fb = feedback?.id === u.id ? feedback : null;
                  return (
                    <div key={u.id} className={`px-4 py-2.5 flex items-center gap-3 flex-wrap ${fb?.ok ? "bg-emerald-50" : ""}`}>
                      <span className="text-lg">{u.isLot ? "💣" : "🔫"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-mono">
                          {u.isLot ? `לוט: ${u.serial}${u.lotQuantity && u.lotQuantity > 1 ? ` × ${u.lotQuantity}` : ""}` : `SN: ${u.serial}`}
                          {u.sku && <span className="text-[10px] text-slate-400 mr-2">{u.sku}</span>}
                        </div>
                        <div className="text-xs text-slate-500 flex flex-wrap gap-2 mt-0.5">
                          <span className={u.isLoss ? "text-rose-600 font-medium" : u.isWear ? "text-amber-600 font-medium" : ""}>
                            {u.statusName}{u.isLoss && " 🔴"}{u.isWear && " 🟡"}
                          </span>
                          {u.signedSoldier ? (
                            <span className="text-blue-700">🪖 חתום: <b>{u.signedSoldier.name}</b>
                              {u.signedSoldier.personalNumber && <span className="font-mono text-slate-400 mr-1">{u.signedSoldier.personalNumber}</span>}
                            </span>
                          ) : (
                            <span className="text-slate-500">📦 לא חתום על חייל</span>
                          )}
                        </div>
                      </div>

                      {/* בורר מיקום - dropdown */}
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-slate-600 whitespace-nowrap">📍 מיקום:</label>
                        <select value={u.equipmentLocationId ?? ""}
                          onChange={(e) => changeLocation(u.id, e.target.value)}
                          disabled={savingId === u.id || locations.length === 0}
                          className={`rounded-lg border-2 px-2 py-1.5 text-sm min-w-44 ${
                            !u.equipmentLocationId ? "border-rose-300 bg-rose-50" : "border-emerald-200 bg-white"
                          } disabled:opacity-50`}>
                          <option value="">— ללא מיקום —</option>
                          {locations.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.isVehicle ? "🚙" : "📍"} {l.name}
                            </option>
                          ))}
                        </select>
                        {savingId === u.id && <span className="text-xs text-slate-500">שומר...</span>}
                        {fb?.ok && <span className="text-xs text-emerald-700">✓</span>}
                        {fb?.msg && <span className="text-xs text-rose-700" title={fb.msg}>⚠️</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
