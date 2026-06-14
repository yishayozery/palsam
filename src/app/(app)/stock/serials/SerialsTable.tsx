"use client";

import { useState, useMemo } from "react";
import { Card, Table, Th, Td, Badge, EmptyState } from "@/components/ui";

type Unit = {
  id: string;
  serialNumber: string;
  lotQuantity: number | null;
  itemTypeId: string;
  itemName: string;
  sku: string | null;
  category: string | null;
  statusId: string;
  statusName: string;
  isWear: boolean;
  isLoss: boolean;
  holderName: string | null;
  signedSoldierName: string | null;
  signedSoldierPN: string | null;
  companyId: string | null;
  companyName: string | null;
  equipmentLocationId: string | null;
  equipmentLocationName: string | null;
  isVehicleLocation: boolean;
};

export default function SerialsTable({ units, initialQ, initialStatus, initialSigned }: {
  units: Unit[]; initialQ: string; initialStatus: string; initialSigned: string;
}) {
  const [q, setQ] = useState(initialQ);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [itemFilter, setItemFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  // רשימות יחודיות לפילטרים
  const allItems = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of units) m.set(u.itemTypeId, u.itemName);
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [units]);
  const allCompanies = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of units) if (u.companyId && u.companyName) m.set(u.companyId, u.companyName);
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [units]);
  const allLocations = useMemo(() => {
    const m = new Map<string, { name: string; isVehicle: boolean }>();
    for (const u of units) if (u.equipmentLocationId && u.equipmentLocationName) {
      m.set(u.equipmentLocationId, { name: u.equipmentLocationName, isVehicle: u.isVehicleLocation });
    }
    return Array.from(m.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => a.name.localeCompare(b.name));
  }, [units]);
  const allStatuses = useMemo(() => {
    const m = new Map<string, { name: string; isWear: boolean; isLoss: boolean }>();
    for (const u of units) m.set(u.statusId, { name: u.statusName, isWear: u.isWear, isLoss: u.isLoss });
    return Array.from(m.entries()).map(([id, v]) => ({ id, ...v }));
  }, [units]);

  const filtered = useMemo(() => {
    return units.filter((u) => {
      if (itemFilter && u.itemTypeId !== itemFilter) return false;
      if (companyFilter && u.companyId !== companyFilter) return false;
      if (locationFilter && u.equipmentLocationId !== locationFilter) return false;
      if (statusFilter && u.statusId !== statusFilter) return false;
      if (q.trim()) {
        const qq = q.trim().toLowerCase();
        return u.serialNumber.toLowerCase().includes(qq)
          || u.itemName.toLowerCase().includes(qq)
          || (u.sku ?? "").toLowerCase().includes(qq)
          || (u.signedSoldierName ?? "").toLowerCase().includes(qq);
      }
      return true;
    });
  }, [units, q, itemFilter, companyFilter, locationFilter, statusFilter]);

  const hasFilters = q || itemFilter || companyFilter || locationFilter || statusFilter;

  return (
    <>
      <Card className="p-3 mb-3 bg-slate-50">
        <div className="text-xs font-semibold text-slate-700 mb-2">🔍 חיפוש מהיר — הזן SN/אצווה אפילו חלקית, או סנן לפי פילטרים</div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-2">
          <div className="md:col-span-3 lg:col-span-2">
            <label className="block text-[11px] text-slate-500 mb-1">מספר סריאל / אצווה (חלקי)</label>
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="לדוגמה: 12345 או PRC710 או מתאם"
              className="w-full rounded-lg border-2 border-blue-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">פריט</label>
            <select value={itemFilter} onChange={(e) => setItemFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">כל הפריטים</option>
              {allItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">🪖 פלוגה</label>
            <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">כל הפלוגות</option>
              {allCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">📍 מיקום</label>
            <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">כל המיקומים</option>
              {allLocations.map((l) => <option key={l.id} value={l.id}>{l.isVehicle ? "🚙 " : "📍 "}{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">סטטוס</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">כל הסטטוסים</option>
              {allStatuses.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.isLoss && " 🔴"}{s.isWear && " 🟡"}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            {hasFilters && (
              <button onClick={() => { setQ(""); setItemFilter(""); setCompanyFilter(""); setLocationFilter(""); setStatusFilter(""); }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs hover:bg-white">✕ נקה</button>
            )}
            <span className="text-xs text-slate-600 self-end pb-2 font-semibold">{filtered.length} תוצאות</span>
          </div>
        </div>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState>לא נמצאו יחידות תואמות. נסה להזין רק חלק מהמספר.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>מס׳ סריאל / אצווה</Th><Th>פריט</Th><Th>סטטוס</Th><Th>מיקום</Th><Th>פלוגה</Th><Th>חתום על</Th></tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const isLot = !!u.lotQuantity && u.lotQuantity > 1;
                return (
                  <tr key={u.id}>
                    <Td className="font-mono">
                      <span className="text-lg ml-1">{isLot ? "💣" : "🔫"}</span>
                      {u.serialNumber}
                      {isLot && <span className="text-xs text-slate-500"> × {u.lotQuantity}</span>}
                    </Td>
                    <Td>
                      <div className="font-medium">{u.itemName}</div>
                      {u.sku && <div className="text-[10px] font-mono text-slate-400">{u.sku}</div>}
                    </Td>
                    <Td>
                      <Badge className={u.isLoss ? "bg-rose-100 text-rose-700" : u.isWear ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}>
                        {u.statusName}
                      </Badge>
                    </Td>
                    <Td className="text-xs">
                      {u.equipmentLocationName ? (
                        <span className="text-slate-700">{u.isVehicleLocation ? "🚙" : "📍"} {u.equipmentLocationName}</span>
                      ) : (
                        <span className="text-slate-300">{u.holderName ?? "—"}</span>
                      )}
                    </Td>
                    <Td className="text-xs">{u.companyName ?? <span className="text-slate-300">—</span>}</Td>
                    <Td className="text-xs">
                      {u.signedSoldierName ? (
                        <span className="text-blue-600">
                          {u.signedSoldierName} {u.signedSoldierPN && <span className="font-mono text-slate-400">({u.signedSoldierPN})</span>}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
