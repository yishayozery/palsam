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

// 🆕 שורה מאוחדת — כל פריט-מיקום-בעלים בשורה אחת
type UnifiedRow = {
  key: string;
  kind: "serial" | "qty_company" | "qty_soldier";
  itemName: string;
  sku: string | null;
  itemDetails: string; // SN / לוט / —
  ownerLabel: string; // "מחסן הפלוגה" / "ניר ישראלי — 9100012"
  ownerKind: "company" | "soldier";
  soldierId: string | null;
  itemTypeId: string | null;
  statusId: string | null;
  quantity: number;
  unit: string;
  statusName: string;
  isWear: boolean;
  isLoss: boolean;
  equipmentLocationId: string | null;
  equipmentLocationName: string | null;
  canSplit: boolean;
  // Backing IDs/context:
  serialUnitId?: string;
  stockBalanceId?: string;
  // לציוד חתום-חייל - צריך לדעת את כל הפלייסמנטים כדי לערוך אחד מהם
  allPlacements?: Placement[];
  totalSigned?: number;
};

export default function CompanyLocationsClient({
  items, companyQtyStock, signedQtyRows, soldiers, locations,
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
  const [splittingId, setSplittingId] = useState<string | null>(null);
  const [splitQty, setSplitQty] = useState(1);
  const [splitTo, setSplitTo] = useState("");
  const [splitErr, setSplitErr] = useState<string | null>(null);

  // איחוד הכל לשורות שטוחות
  const allRows: UnifiedRow[] = useMemo(() => {
    const rows: UnifiedRow[] = [];

    // סריאליים
    for (const u of items) {
      rows.push({
        key: `s:${u.id}`,
        kind: "serial",
        itemName: u.itemName,
        sku: u.sku,
        itemDetails: u.isLot ? `לוט: ${u.serial}` : `SN: ${u.serial}`,
        ownerLabel: u.signedSoldier
          ? `${u.signedSoldier.name}${u.signedSoldier.personalNumber ? ` — ${u.signedSoldier.personalNumber}` : ""}`
          : "מחסן הפלוגה",
        ownerKind: u.signedSoldier ? "soldier" : "company",
        soldierId: u.signedSoldier?.id ?? null,
        itemTypeId: null,
        statusId: null,
        quantity: u.lotQuantity ?? 1,
        unit: "יח",
        statusName: u.statusName,
        isWear: u.isWear,
        isLoss: u.isLoss,
        equipmentLocationId: u.equipmentLocationId,
        equipmentLocationName: u.equipmentLocationName,
        canSplit: false,
        serialUnitId: u.id,
      });
    }

    // כמותי במלאי הפלוגה
    for (const s of companyQtyStock) {
      rows.push({
        key: `cq:${s.stockBalanceId}`,
        kind: "qty_company",
        itemName: s.itemName,
        sku: s.sku,
        itemDetails: "",
        ownerLabel: "מחסן הפלוגה",
        ownerKind: "company",
        soldierId: null,
        itemTypeId: s.itemTypeId,
        statusId: s.statusId,
        quantity: s.quantity,
        unit: s.unit,
        statusName: s.statusName,
        isWear: s.isWear,
        isLoss: s.isLoss,
        equipmentLocationId: s.equipmentLocationId,
        equipmentLocationName: s.equipmentLocationName,
        canSplit: s.quantity > 1,
        stockBalanceId: s.stockBalanceId,
      });
    }

    // כמותי חתום על חיילים — שורה לכל placement + שורה ל"לא ממוקם" אם יש
    for (const r of signedQtyRows) {
      const placed = r.placements.reduce((a, p) => a + p.quantity, 0);
      for (const p of r.placements) {
        rows.push({
          key: `sq:${r.soldierId}:${r.itemTypeId}:${r.statusId}:${p.equipmentLocationId}`,
          kind: "qty_soldier",
          itemName: r.itemName,
          sku: r.sku,
          itemDetails: "",
          ownerLabel: `${r.soldierName}${r.soldierPN ? ` — ${r.soldierPN}` : ""}`,
          ownerKind: "soldier",
          soldierId: r.soldierId,
          itemTypeId: r.itemTypeId,
          statusId: r.statusId,
          quantity: p.quantity,
          unit: r.unit,
          statusName: r.statusName,
          isWear: r.isWear,
          isLoss: r.isLoss,
          equipmentLocationId: p.equipmentLocationId,
          equipmentLocationName: p.equipmentLocationName,
          canSplit: p.quantity > 1,
          allPlacements: r.placements,
          totalSigned: r.totalQuantity,
        });
      }
      const unplaced = r.totalQuantity - placed;
      if (unplaced > 0) {
        rows.push({
          key: `sq:${r.soldierId}:${r.itemTypeId}:${r.statusId}:__null__`,
          kind: "qty_soldier",
          itemName: r.itemName,
          sku: r.sku,
          itemDetails: "",
          ownerLabel: `${r.soldierName}${r.soldierPN ? ` — ${r.soldierPN}` : ""}`,
          ownerKind: "soldier",
          soldierId: r.soldierId,
          itemTypeId: r.itemTypeId,
          statusId: r.statusId,
          quantity: unplaced,
          unit: r.unit,
          statusName: r.statusName,
          isWear: r.isWear,
          isLoss: r.isLoss,
          equipmentLocationId: null,
          equipmentLocationName: null,
          canSplit: unplaced > 1,
          allPlacements: r.placements,
          totalSigned: r.totalQuantity,
        });
      }
    }

    return rows;
  }, [items, companyQtyStock, signedQtyRows]);

  const uniqueItemNames = useMemo(() => {
    const set = new Set(allRows.map((r) => r.itemName));
    return Array.from(set).sort();
  }, [allRows]);

  // סינון
  const filtered = useMemo(() => {
    return allRows.filter((r) => {
      if (q.trim()) {
        const s = q.toLowerCase();
        if (!`${r.itemName} ${r.sku ?? ""} ${r.itemDetails} ${r.ownerLabel}`.toLowerCase().includes(s)) return false;
      }
      if (locFilter === "__unassigned__" && r.equipmentLocationId) return false;
      if (locFilter && locFilter !== "__unassigned__" && r.equipmentLocationId !== locFilter) return false;
      if (signedFilter === "signed" && r.ownerKind !== "soldier") return false;
      if (signedFilter === "unsigned" && r.ownerKind !== "company") return false;
      if (soldierFilter && r.soldierId !== soldierFilter) return false;
      if (itemFilter && r.itemName !== itemFilter) return false;
      return true;
    }).sort((a, b) =>
      a.itemName.localeCompare(b.itemName) ||
      a.ownerLabel.localeCompare(b.ownerLabel) ||
      (a.equipmentLocationName ?? "ZZ").localeCompare(b.equipmentLocationName ?? "ZZ")
    );
  }, [allRows, q, locFilter, signedFilter, soldierFilter, itemFilter]);

  // ספירות לפי מיקום
  const countsByLoc = useMemo(() => {
    const m = new Map<string, number>();
    let unassigned = 0;
    for (const r of allRows) {
      if (r.equipmentLocationId) m.set(r.equipmentLocationId, (m.get(r.equipmentLocationId) ?? 0) + r.quantity);
      else unassigned += r.quantity;
    }
    return { byLoc: m, unassigned };
  }, [allRows]);

  // ===== Actions =====
  async function changeLocation(r: UnifiedRow, newLocId: string | null) {
    const id = r.key;
    setSavingId(id); setFeedback(null);
    try {
      let res: { ok?: boolean; error?: string } | undefined;
      if (r.kind === "serial" && r.serialUnitId) {
        const fd = new FormData();
        fd.append("serialUnitId", r.serialUnitId);
        if (newLocId) fd.append("equipmentLocationId", newLocId);
        res = await setUnitEquipmentLocation(fd);
      } else if (r.kind === "qty_company" && r.stockBalanceId) {
        const fd = new FormData();
        fd.append("stockBalanceId", r.stockBalanceId);
        if (newLocId) fd.append("equipmentLocationId", newLocId);
        res = await setStockEquipmentLocation(fd);
      } else if (r.kind === "qty_soldier" && r.soldierId && r.itemTypeId && r.statusId && r.allPlacements) {
        // עורכים placement אחד: מוציאים את הישן ומוסיפים חדש
        const next = r.allPlacements.filter((p) => p.equipmentLocationId !== r.equipmentLocationId);
        if (newLocId) {
          const locName = locations.find((l) => l.id === newLocId)?.name ?? "";
          // אם כבר יש placement במיקום החדש — מאחדים
          const existing = next.find((p) => p.equipmentLocationId === newLocId);
          if (existing) existing.quantity += r.quantity;
          else next.push({ equipmentLocationId: newLocId, equipmentLocationName: locName, quantity: r.quantity });
        }
        const fd = new FormData();
        fd.append("soldierId", r.soldierId);
        fd.append("itemTypeId", r.itemTypeId);
        fd.append("statusId", r.statusId);
        fd.append("placements", JSON.stringify(next));
        res = await setSoldierItemPlacements(fd);
      }
      if (res?.error) setFeedback({ id, ok: false, msg: res.error });
      else { setFeedback({ id, ok: true }); router.refresh(); }
    } finally { setSavingId(null); setTimeout(() => setFeedback(null), 2000); }
  }

  async function doSplit(r: UnifiedRow) {
    if (!splitTo) { setSplitErr("בחר מיקום יעד"); return; }
    if (splitQty < 1 || splitQty >= r.quantity) { setSplitErr("כמות לא חוקית"); return; }
    setSavingId(r.key); setSplitErr(null);
    try {
      let res: { ok?: boolean; error?: string } | undefined;
      if (r.kind === "qty_company" && r.stockBalanceId) {
        const fd = new FormData();
        fd.append("stockBalanceId", r.stockBalanceId);
        fd.append("toLocationId", splitTo);
        fd.append("quantity", String(splitQty));
        res = await moveStockToLocation(fd);
      } else if (r.kind === "qty_soldier" && r.soldierId && r.itemTypeId && r.statusId && r.allPlacements) {
        // מקטינים את ה-placement הנוכחי, מוסיפים placement חדש ביעד
        const next = r.allPlacements.map((p) =>
          p.equipmentLocationId === r.equipmentLocationId
            ? { ...p, quantity: p.quantity - splitQty }
            : p
        ).filter((p) => p.quantity > 0);
        const locName = locations.find((l) => l.id === splitTo)?.name ?? "";
        const existing = next.find((p) => p.equipmentLocationId === splitTo);
        if (existing) existing.quantity += splitQty;
        else next.push({ equipmentLocationId: splitTo, equipmentLocationName: locName, quantity: splitQty });
        // אם זה ה"לא ממוקם" - מוסיפים בלי להפחית
        if (r.equipmentLocationId === null) {
          const allCurrent = r.allPlacements.slice();
          const existing2 = allCurrent.find((p) => p.equipmentLocationId === splitTo);
          if (existing2) existing2.quantity += splitQty;
          else allCurrent.push({ equipmentLocationId: splitTo, equipmentLocationName: locName, quantity: splitQty });
          const fd = new FormData();
          fd.append("soldierId", r.soldierId);
          fd.append("itemTypeId", r.itemTypeId);
          fd.append("statusId", r.statusId);
          fd.append("placements", JSON.stringify(allCurrent));
          res = await setSoldierItemPlacements(fd);
        } else {
          const fd = new FormData();
          fd.append("soldierId", r.soldierId);
          fd.append("itemTypeId", r.itemTypeId);
          fd.append("statusId", r.statusId);
          fd.append("placements", JSON.stringify(next));
          res = await setSoldierItemPlacements(fd);
        }
      }
      if (res?.error) setSplitErr(res.error);
      else { setSplittingId(null); setSplitQty(1); setSplitTo(""); router.refresh(); }
    } finally { setSavingId(null); }
  }

  return (
    <div className="space-y-4">
      {/* פאנל מיקומים */}
      <Card className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setLocFilter("")}
            className={`text-xs rounded-full px-3 py-1 ${!locFilter ? "bg-slate-800 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>
            הכל ({allRows.length})
          </button>
          <button onClick={() => setLocFilter("__unassigned__")}
            className={`text-xs rounded-full px-3 py-1 ${locFilter === "__unassigned__" ? "bg-rose-700 text-white" : "bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200"}`}>
            ⚠️ ללא מיקום ({countsByLoc.unassigned})
          </button>
          {locations.map((l) => (
            <button key={l.id} onClick={() => setLocFilter(l.id)}
              className={`text-xs rounded-full px-3 py-1 ${locFilter === l.id ? "bg-blue-700 text-white" : "bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200"}`}>
              {l.isVehicle ? "🚙" : "📍"} {l.name} ({countsByLoc.byLoc.get(l.id) ?? 0})
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
            <option value="unsigned">📦 במחסן הפלוגה</option>
          </select>
          {(q || locFilter || signedFilter || soldierFilter || itemFilter) && (
            <button onClick={() => { setQ(""); setLocFilter(""); setSignedFilter(""); setSoldierFilter(""); setItemFilter(""); }}
              className="rounded-lg border border-slate-300 text-sm hover:bg-slate-50 lg:col-span-1">✕ נקה פילטרים</button>
          )}
          <div className="sm:col-span-2 lg:col-span-4 text-xs text-slate-500">
            {filtered.length} שורות מתוך {allRows.length}
          </div>
        </div>
      </Card>

      {/* טבלה מאוחדת */}
      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-400">אין פריטים מתאימים</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-right p-2.5 font-medium text-xs text-slate-600">פריט</th>
                  <th className="text-right p-2.5 font-medium text-xs text-slate-600">חתום על</th>
                  <th className="text-right p-2.5 font-medium text-xs text-slate-600">כמות</th>
                  <th className="text-right p-2.5 font-medium text-xs text-slate-600">סטטוס</th>
                  <th className="text-right p-2.5 font-medium text-xs text-slate-600">📍 מיקום</th>
                  <th className="text-right p-2.5 font-medium text-xs text-slate-600">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => {
                  const fb = feedback?.id === r.key ? feedback : null;
                  const isSplitting = splittingId === r.key;
                  const isSaving = savingId === r.key;
                  return (
                    <>
                      <tr key={r.key} className={fb?.ok ? "bg-emerald-50" : "hover:bg-slate-50"}>
                        <td className="p-2.5">
                          <div className="font-medium">{r.itemName}</div>
                          <div className="text-[11px] text-slate-500 flex gap-2 flex-wrap">
                            {r.sku && <span className="font-mono">{r.sku}</span>}
                            {r.itemDetails && <span className="font-mono">{r.itemDetails}</span>}
                          </div>
                        </td>
                        <td className="p-2.5">
                          {r.ownerKind === "soldier" ? (
                            <span className="text-blue-700">🪖 {r.ownerLabel}</span>
                          ) : (
                            <span className="text-slate-700">📦 {r.ownerLabel}</span>
                          )}
                        </td>
                        <td className="p-2.5 font-mono">
                          <span className="bg-slate-100 rounded px-2 py-0.5">×{r.quantity}</span>
                          <span className="text-[11px] text-slate-400 mr-1">{r.unit}</span>
                        </td>
                        <td className="p-2.5">
                          <span className={r.isLoss ? "text-rose-600 font-medium" : r.isWear ? "text-amber-600 font-medium" : ""}>
                            {r.statusName}{r.isLoss && " 🔴"}{r.isWear && " 🟡"}
                          </span>
                        </td>
                        <td className="p-2.5">
                          <select value={r.equipmentLocationId ?? ""}
                            onChange={(e) => changeLocation(r, e.target.value || null)}
                            disabled={isSaving || locations.length === 0}
                            className={`rounded-lg border-2 px-2 py-1 text-sm min-w-44 ${
                              !r.equipmentLocationId ? "border-rose-300 bg-rose-50" : "border-emerald-200 bg-white"
                            } disabled:opacity-50`}>
                            <option value="">— ללא מיקום —</option>
                            {locations.map((l) => (
                              <option key={l.id} value={l.id}>{l.isVehicle ? "🚙" : "📍"} {l.name}</option>
                            ))}
                          </select>
                          {isSaving && <span className="text-xs text-slate-500 mr-2">שומר...</span>}
                          {fb?.ok && <span className="text-xs text-emerald-700 mr-2">✓</span>}
                          {fb?.msg && <span className="text-xs text-rose-700 mr-2" title={fb.msg}>⚠️</span>}
                        </td>
                        <td className="p-2.5">
                          {r.canSplit && !isSplitting && (
                            <button onClick={() => { setSplittingId(r.key); setSplitQty(1); setSplitTo(""); setSplitErr(null); }}
                              className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg px-2 py-1 whitespace-nowrap">
                              📤 פצל
                            </button>
                          )}
                        </td>
                      </tr>
                      {isSplitting && (
                        <tr className="bg-blue-50">
                          <td colSpan={6} className="p-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-slate-700 font-medium">📤 פצל {r.itemName}:</span>
                              <span className="text-xs text-slate-700">העבר</span>
                              <input type="number" min={1} max={r.quantity - 1} value={splitQty}
                                onChange={(e) => setSplitQty(Math.max(1, Math.min(r.quantity - 1, parseInt(e.target.value) || 1)))}
                                className="w-20 rounded border border-slate-300 px-2 py-1 text-center" />
                              <span className="text-xs text-slate-700">מתוך {r.quantity} ל-</span>
                              <select value={splitTo} onChange={(e) => setSplitTo(e.target.value)}
                                className="rounded border border-slate-300 px-2 py-1 text-sm">
                                <option value="">— בחר יעד —</option>
                                {locations.filter((l) => l.id !== r.equipmentLocationId).map((l) => (
                                  <option key={l.id} value={l.id}>{l.isVehicle ? "🚙" : "📍"} {l.name}</option>
                                ))}
                              </select>
                              <button onClick={() => doSplit(r)} disabled={isSaving || !splitTo}
                                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded px-3 py-1 disabled:opacity-50">
                                ✓ פצל
                              </button>
                              <button onClick={() => { setSplittingId(null); setSplitErr(null); }}
                                className="text-xs text-slate-500">ביטול</button>
                              {splitErr && <span className="text-xs text-rose-700 w-full mt-1">⚠️ {splitErr}</span>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
