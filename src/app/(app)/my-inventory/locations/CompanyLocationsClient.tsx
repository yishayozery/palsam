"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import {
  setUnitEquipmentLocation,
  setStockEquipmentLocation,
  setSoldierItemPlacements,
  moveStockToLocation,
} from "../../locations/actions";

type SerialItem = {
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
type QtyStock = {
  stockBalanceId: string;
  itemTypeId: string;
  itemName: string;
  sku: string | null;
  unit: string;
  statusId: string;
  statusName: string;
  isWear: boolean;
  isLoss: boolean;
  quantity: number;
  equipmentLocationId: string | null;
  equipmentLocationName: string | null;
};
type Placement = { equipmentLocationId: string; equipmentLocationName: string; quantity: number };
type SignedQtyRow = {
  soldierId: string;
  soldierName: string;
  soldierPN: string | null;
  itemTypeId: string;
  itemName: string;
  sku: string | null;
  unit: string;
  statusId: string;
  statusName: string;
  isWear: boolean;
  isLoss: boolean;
  totalQuantity: number;
  placements: Placement[];
};
type Soldier = { id: string; name: string; personalNumber: string | null };
type Location = {
  id: string; name: string;
  vehicleSerial: string | null;
  isVehicle: boolean;
  count: number;
};

export default function CompanyLocationsClient({
  items, companyQtyStock, signedQtyRows, soldiers, locations, unassignedCount,
  initialQ, initialLoc, initialSigned,
}: {
  items: SerialItem[];
  companyQtyStock: QtyStock[];
  signedQtyRows: SignedQtyRow[];
  soldiers: Soldier[];
  locations: Location[];
  unassignedCount: number;
  initialQ: string; initialLoc: string; initialSigned: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [locFilter, setLocFilter] = useState(initialLoc);
  const [signedFilter, setSignedFilter] = useState(initialSigned);
  const [soldierFilter, setSoldierFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; ok: boolean; msg?: string } | null>(null);

  // רשימת פריטים ייחודית לבורר
  const uniqueItemNames = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.itemName));
    companyQtyStock.forEach((i) => set.add(i.itemName));
    signedQtyRows.forEach((i) => set.add(i.itemName));
    return Array.from(set).sort();
  }, [items, companyQtyStock, signedQtyRows]);

  // טקסט חיפוש כללי + פילטרים
  const matchesText = (text: string) => !q.trim() || text.toLowerCase().includes(q.toLowerCase());

  const filteredSerial = items.filter((i) => {
    if (!matchesText(`${i.itemName} ${i.sku ?? ""} ${i.serial} ${i.signedSoldier?.name ?? ""} ${i.signedSoldier?.personalNumber ?? ""}`)) return false;
    if (locFilter === "__unassigned__" && i.equipmentLocationId) return false;
    if (locFilter && locFilter !== "__unassigned__" && i.equipmentLocationId !== locFilter) return false;
    if (signedFilter === "signed" && !i.signedSoldier) return false;
    if (signedFilter === "unsigned" && i.signedSoldier) return false;
    if (soldierFilter && i.signedSoldier?.id !== soldierFilter) return false;
    if (itemFilter && i.itemName !== itemFilter) return false;
    return true;
  });

  const filteredCompanyQty = companyQtyStock.filter((s) => {
    if (!matchesText(`${s.itemName} ${s.sku ?? ""}`)) return false;
    if (locFilter === "__unassigned__" && s.equipmentLocationId) return false;
    if (locFilter && locFilter !== "__unassigned__" && s.equipmentLocationId !== locFilter) return false;
    if (signedFilter === "signed") return false;
    if (soldierFilter) return false;
    if (itemFilter && s.itemName !== itemFilter) return false;
    return true;
  });

  const filteredSignedQty = signedQtyRows.filter((r) => {
    if (!matchesText(`${r.itemName} ${r.sku ?? ""} ${r.soldierName} ${r.soldierPN ?? ""}`)) return false;
    if (signedFilter === "unsigned") return false;
    if (soldierFilter && r.soldierId !== soldierFilter) return false;
    if (itemFilter && r.itemName !== itemFilter) return false;
    if (locFilter === "__unassigned__") {
      const placed = r.placements.reduce((s, p) => s + p.quantity, 0);
      if (placed === r.totalQuantity) return false;
    } else if (locFilter) {
      if (!r.placements.some((p) => p.equipmentLocationId === locFilter)) return false;
    }
    return true;
  });

  const totalFiltered = filteredSerial.length + filteredCompanyQty.length + filteredSignedQty.length;

  async function changeSerialLocation(itemId: string, locationId: string) {
    setSavingId(itemId); setFeedback(null);
    try {
      const fd = new FormData();
      fd.append("serialUnitId", itemId);
      if (locationId) fd.append("equipmentLocationId", locationId);
      const res = await setUnitEquipmentLocation(fd);
      if (res?.error) setFeedback({ id: itemId, ok: false, msg: res.error });
      else { setFeedback({ id: itemId, ok: true }); router.refresh(); }
    } finally { setSavingId(null); setTimeout(() => setFeedback(null), 2000); }
  }

  async function changeStockLocation(stockId: string, locationId: string) {
    setSavingId(stockId); setFeedback(null);
    try {
      const fd = new FormData();
      fd.append("stockBalanceId", stockId);
      if (locationId) fd.append("equipmentLocationId", locationId);
      const res = await setStockEquipmentLocation(fd);
      if (res?.error) setFeedback({ id: stockId, ok: false, msg: res.error });
      else { setFeedback({ id: stockId, ok: true }); router.refresh(); }
    } finally { setSavingId(null); setTimeout(() => setFeedback(null), 2000); }
  }

  return (
    <div className="space-y-4">
      {/* פאנל סטטיסטיקות לפי מיקום */}
      <Card className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setLocFilter("")}
            className={`text-xs rounded-full px-3 py-1 ${!locFilter ? "bg-slate-800 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>
            הכל
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 חיפוש חופשי" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <select value={soldierFilter} onChange={(e) => setSoldierFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">🪖 כל החיילים</option>
            {soldiers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.personalNumber ? ` · ${s.personalNumber}` : ""}</option>
            ))}
          </select>
          <select value={itemFilter} onChange={(e) => setItemFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">📦 כל הפריטים</option>
            {uniqueItemNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={signedFilter} onChange={(e) => setSignedFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">הכל</option>
            <option value="signed">🪖 חתום על חייל</option>
            <option value="unsigned">📦 לא חתום</option>
          </select>
          {(q || locFilter || signedFilter || soldierFilter || itemFilter) && (
            <button onClick={() => { setQ(""); setLocFilter(""); setSignedFilter(""); setSoldierFilter(""); setItemFilter(""); }}
              className="rounded-lg border border-slate-300 text-sm hover:bg-slate-50 lg:col-span-1">✕ נקה פילטרים</button>
          )}
          <div className="sm:col-span-2 lg:col-span-4 text-xs text-slate-500">
            {totalFiltered} פריטים מתוך {items.length + companyQtyStock.length + signedQtyRows.length}
          </div>
        </div>
      </Card>

      {totalFiltered === 0 && <Card className="p-10 text-center text-slate-400">אין פריטים מתאימים</Card>}

      {/* סריאלי */}
      {filteredSerial.length > 0 && (
        <Card className="overflow-hidden">
          <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
            <h3 className="font-bold text-slate-700">🔫 סריאלי / אצוות ({filteredSerial.length})</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredSerial.map((u) => {
              const fb = feedback?.id === u.id ? feedback : null;
              return (
                <div key={u.id} className={`px-4 py-2.5 flex items-center gap-3 flex-wrap ${fb?.ok ? "bg-emerald-50" : ""}`}>
                  <span className="text-lg">{u.isLot ? "💣" : "🔫"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {u.itemName}
                      {u.sku && <span className="text-[10px] text-slate-400 mr-2">{u.sku}</span>}
                    </div>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-2 mt-0.5">
                      <span className="font-mono">{u.isLot ? `לוט: ${u.serial}` : `SN: ${u.serial}`}</span>
                      <span className={u.isLoss ? "text-rose-600 font-medium" : u.isWear ? "text-amber-600 font-medium" : ""}>
                        {u.statusName}{u.isLoss && " 🔴"}{u.isWear && " 🟡"}
                      </span>
                      {u.signedSoldier ? (
                        <span className="text-blue-700">🪖 <b>{u.signedSoldier.name}</b>
                          {u.signedSoldier.personalNumber && <span className="font-mono text-slate-400 mr-1">{u.signedSoldier.personalNumber}</span>}
                        </span>
                      ) : <span className="text-slate-500">📦 לא חתום</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-slate-600 whitespace-nowrap">📍</label>
                    <select value={u.equipmentLocationId ?? ""}
                      onChange={(e) => changeSerialLocation(u.id, e.target.value)}
                      disabled={savingId === u.id || locations.length === 0}
                      className={`rounded-lg border-2 px-2 py-1.5 text-sm min-w-44 ${
                        !u.equipmentLocationId ? "border-rose-300 bg-rose-50" : "border-emerald-200 bg-white"
                      } disabled:opacity-50`}>
                      <option value="">— ללא מיקום —</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>{l.isVehicle ? "🚙" : "📍"} {l.name}</option>
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
      )}

      {/* כמותי במלאי הפלוגה - מקובץ לפי (item, status) להצגת פיצולים */}
      {filteredCompanyQty.length > 0 && (() => {
        const groups = new Map<string, QtyStock[]>();
        for (const s of filteredCompanyQty) {
          const k = `${s.itemTypeId}|${s.statusId}`;
          const arr = groups.get(k) ?? [];
          arr.push(s);
          groups.set(k, arr);
        }
        const groupArr = Array.from(groups.values()).sort((a, b) => a[0].itemName.localeCompare(b[0].itemName));
        return (
          <Card className="overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
              <h3 className="font-bold text-slate-700">📦 כמותי במלאי הפלוגה ({groupArr.length} פריטים, {filteredCompanyQty.length} שורות)</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {groupArr.map((rows) => (
                <CompanyQtyGroup
                  key={`${rows[0].itemTypeId}|${rows[0].statusId}`}
                  rows={rows}
                  locations={locations}
                  feedback={feedback}
                  savingId={savingId}
                  onChange={(id, locId) => changeStockLocation(id, locId)}
                  onSplit={() => router.refresh()}
                />
              ))}
            </div>
          </Card>
        );
      })()}

      {/* כמותי חתום על חיילים */}
      {filteredSignedQty.length > 0 && (
        <Card className="overflow-hidden">
          <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
            <h3 className="font-bold text-slate-700">🪖 כמותי חתום על חיילים ({filteredSignedQty.length})</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredSignedQty.map((r) => (
              <SignedQtyRowEditor key={`${r.soldierId}|${r.itemTypeId}|${r.statusId}`}
                row={r} locations={locations} onSaved={() => router.refresh()} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function SignedQtyRowEditor({
  row, locations, onSaved,
}: {
  row: SignedQtyRow;
  locations: Location[];
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [placements, setPlacements] = useState<Placement[]>(row.placements);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placed = placements.reduce((s, p) => s + (p.quantity || 0), 0);
  const remaining = row.totalQuantity - placed;

  async function save() {
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("soldierId", row.soldierId);
      fd.append("itemTypeId", row.itemTypeId);
      fd.append("statusId", row.statusId);
      fd.append("placements", JSON.stringify(placements.filter((p) => p.quantity > 0)));
      const res = await setSoldierItemPlacements(fd);
      if (res?.error) setError(res.error);
      else { setEditing(false); onSaved(); }
    } finally { setBusy(false); }
  }

  function addPlacement() {
    const used = new Set(placements.map((p) => p.equipmentLocationId));
    const next = locations.find((l) => !used.has(l.id));
    if (!next) return;
    setPlacements([...placements, { equipmentLocationId: next.id, equipmentLocationName: next.name, quantity: 1 }]);
  }

  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-lg">🪖</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            {row.itemName}
            {row.sku && <span className="text-[10px] text-slate-400 mr-2">{row.sku}</span>}
            <span className="text-[11px] bg-blue-100 text-blue-800 rounded px-1.5 py-0.5 mr-1">×{row.totalQuantity} {row.unit}</span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-2">
            <span className="text-blue-700"><b>{row.soldierName}</b>
              {row.soldierPN && <span className="font-mono text-slate-400 mr-1">{row.soldierPN}</span>}
            </span>
            <span className={row.isLoss ? "text-rose-600 font-medium" : row.isWear ? "text-amber-600 font-medium" : ""}>
              {row.statusName}{row.isLoss && " 🔴"}{row.isWear && " 🟡"}
            </span>
            {!editing && row.placements.length > 0 && (
              <span className="text-emerald-700">
                📍 {row.placements.map((p) => `${p.equipmentLocationName} ×${p.quantity}`).join(" / ")}
              </span>
            )}
            {!editing && remaining > 0 && row.placements.length > 0 && (
              <span className="text-rose-600">⚠️ {remaining} לא מוקצים</span>
            )}
            {!editing && row.placements.length === 0 && (
              <span className="text-rose-600">⚠️ ללא מיקום</span>
            )}
          </div>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5">
            📍 הגדר מיקום
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-3 bg-slate-50 rounded-lg p-3 space-y-2">
          {placements.length === 0 ? (
            <div className="text-xs text-slate-500">לחץ "+ הוסף מיקום" כדי להתחיל לשייך</div>
          ) : (
            placements.map((p, idx) => (
              <div key={idx} className="flex items-center gap-2 flex-wrap">
                <select value={p.equipmentLocationId}
                  onChange={(e) => {
                    const loc = locations.find((l) => l.id === e.target.value);
                    const next = [...placements];
                    next[idx] = { ...p, equipmentLocationId: e.target.value, equipmentLocationName: loc?.name ?? "" };
                    setPlacements(next);
                  }}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.isVehicle ? "🚙" : "📍"} {l.name}</option>
                  ))}
                </select>
                <input type="number" min={1} max={row.totalQuantity} value={p.quantity}
                  onChange={(e) => {
                    const next = [...placements];
                    next[idx] = { ...p, quantity: Math.max(0, parseInt(e.target.value) || 0) };
                    setPlacements(next);
                  }}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-center" />
                <span className="text-xs text-slate-500">{row.unit}</span>
                <button onClick={() => setPlacements(placements.filter((_, i) => i !== idx))}
                  className="text-rose-500 hover:text-rose-700 text-sm">✕</button>
              </div>
            ))
          )}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <button onClick={addPlacement} disabled={placements.length >= locations.length}
              className="text-xs rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 px-3 py-1.5 disabled:opacity-50">
              + הוסף מיקום
            </button>
            <span className="text-xs text-slate-500">
              סך {placed} / {row.totalQuantity} {row.unit}
              {remaining !== 0 && <span className={remaining > 0 ? "text-amber-600 mr-2" : "text-rose-600 mr-2"}>
                ({remaining > 0 ? `נשארו ${remaining}` : `חורג ב-${Math.abs(remaining)}`})
              </span>}
            </span>
          </div>
          {error && <div className="text-xs text-rose-700 bg-rose-50 rounded p-2">⚠️ {error}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={busy || remaining < 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-1.5 text-sm disabled:opacity-50">
              ✓ שמור
            </button>
            <button onClick={() => { setEditing(false); setPlacements(row.placements); setError(null); }}
              className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm">ביטול</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CompanyQtyGroup({
  rows, locations, feedback, savingId, onChange, onSplit,
}: {
  rows: QtyStock[];
  locations: Location[];
  feedback: { id: string; ok: boolean; msg?: string } | null;
  savingId: string | null;
  onChange: (id: string, locId: string) => void;
  onSplit: () => void;
}) {
  const first = rows[0];
  const total = rows.reduce((s, r) => s + r.quantity, 0);
  const [splittingId, setSplittingId] = useState<string | null>(null);
  const [splitQty, setSplitQty] = useState(1);
  const [splitTo, setSplitTo] = useState("");
  const [splitErr, setSplitErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function doSplit(sourceId: string, sourceQty: number) {
    setSplitErr(null);
    if (!splitTo) { setSplitErr("בחר מיקום יעד"); return; }
    if (splitQty < 1 || splitQty > sourceQty) { setSplitErr("כמות לא חוקית"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("stockBalanceId", sourceId);
      fd.append("toLocationId", splitTo);
      fd.append("quantity", String(splitQty));
      const res = await moveStockToLocation(fd);
      if (res?.error) setSplitErr(res.error);
      else { setSplittingId(null); setSplitQty(1); setSplitTo(""); onSplit(); }
    } finally { setBusy(false); }
  }

  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <span className="text-lg">📦</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            {first.itemName}
            {first.sku && <span className="text-[10px] text-slate-400 mr-2">{first.sku}</span>}
            <span className="text-[11px] bg-blue-100 text-blue-800 rounded px-1.5 py-0.5 mr-1">×{total} {first.unit}</span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            <span className={first.isLoss ? "text-rose-600 font-medium" : first.isWear ? "text-amber-600 font-medium" : ""}>
              {first.statusName}{first.isLoss && " 🔴"}{first.isWear && " 🟡"}
            </span>
            {rows.length > 1 && <span className="mr-2 text-blue-700">📤 מפוצל ל-{rows.length} מיקומים</span>}
          </div>
        </div>
      </div>
      {/* כל שורת מיקום בנפרד */}
      <div className="space-y-1.5 ms-7">
        {rows.map((s) => {
          const fb = feedback?.id === s.stockBalanceId ? feedback : null;
          const canSplit = s.quantity > 1 && locations.length > 0;
          const isSplitting = splittingId === s.stockBalanceId;
          return (
            <div key={s.stockBalanceId}>
              <div className={`flex items-center gap-2 flex-wrap text-sm ${fb?.ok ? "bg-emerald-50 rounded p-1" : ""}`}>
                <span className="font-mono text-slate-600 text-xs bg-slate-100 rounded px-2 py-0.5">×{s.quantity}</span>
                <label className="text-[11px] text-slate-600 whitespace-nowrap">📍</label>
                <select value={s.equipmentLocationId ?? ""}
                  onChange={(e) => onChange(s.stockBalanceId, e.target.value)}
                  disabled={savingId === s.stockBalanceId || locations.length === 0}
                  className={`rounded-lg border-2 px-2 py-1 text-sm min-w-44 ${
                    !s.equipmentLocationId ? "border-rose-300 bg-rose-50" : "border-emerald-200 bg-white"
                  } disabled:opacity-50`}>
                  <option value="">— ללא מיקום —</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.isVehicle ? "🚙" : "📍"} {l.name}</option>
                  ))}
                </select>
                {canSplit && !isSplitting && (
                  <button onClick={() => { setSplittingId(s.stockBalanceId); setSplitQty(1); setSplitTo(""); setSplitErr(null); }}
                    className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg px-2 py-1">
                    📤 פצל למיקום נוסף
                  </button>
                )}
                {savingId === s.stockBalanceId && <span className="text-xs text-slate-500">שומר...</span>}
                {fb?.ok && <span className="text-xs text-emerald-700">✓</span>}
                {fb?.msg && <span className="text-xs text-rose-700" title={fb.msg}>⚠️</span>}
              </div>
              {isSplitting && (
                <div className="mt-1.5 bg-blue-50 border border-blue-200 rounded-lg p-2 flex items-center gap-2 flex-wrap text-sm">
                  <span className="text-xs text-slate-700">העבר</span>
                  <input type="number" min={1} max={s.quantity - 1} value={splitQty}
                    onChange={(e) => setSplitQty(Math.max(1, Math.min(s.quantity - 1, parseInt(e.target.value) || 1)))}
                    className="w-20 rounded border border-slate-300 px-2 py-1 text-center" />
                  <span className="text-xs text-slate-700">מתוך {s.quantity} ל-</span>
                  <select value={splitTo} onChange={(e) => setSplitTo(e.target.value)}
                    className="rounded border border-slate-300 px-2 py-1 text-sm">
                    <option value="">— בחר יעד —</option>
                    {locations.filter((l) => l.id !== s.equipmentLocationId).map((l) => (
                      <option key={l.id} value={l.id}>{l.isVehicle ? "🚙" : "📍"} {l.name}</option>
                    ))}
                  </select>
                  <button onClick={() => doSplit(s.stockBalanceId, s.quantity)} disabled={busy || !splitTo}
                    className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded px-3 py-1 disabled:opacity-50">
                    ✓ פצל
                  </button>
                  <button onClick={() => { setSplittingId(null); setSplitErr(null); }}
                    className="text-xs text-slate-500">ביטול</button>
                  {splitErr && <span className="text-xs text-rose-700 w-full mt-1">⚠️ {splitErr}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
