"use client";

import React, { useState, useTransition, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { saveTemplate, deleteTemplate, saveDispatchRole, toggleDispatchRole } from "./actions";
import CrudSection from "@/components/CrudSection";

type VehicleType = { id: string; name: string };
type Vehicle = {
  id: string;
  itemTypeId: string;
  itemName: string;
  serialNumber: string;
  holderName: string | null;
  requiredLicenseIds: string[];
};
type Soldier = {
  id: string;
  fullName: string;
  personalNumber: string | null;
  companyId: string | null;
  companyRoleId: string | null;
  companyName: string | null;
  roleName: string | null;
  licenseIds: string[];
  licenseNames: string[];
  drivingRefresherDate: string | null;
};
type CompanyRoleOption = { id: string; name: string };
type DispatchRoleType = { id: string; name: string; icon: string; isDriver: boolean; companyRoleId: string | null; sortOrder: number };
type TemplateSlot = {
  dispatchRoleId: string;
  roleName: string;
  roleIcon: string;
  isDriver: boolean;
  soldierId: string | null;
  soldierName: string | null;
  soldierCompany: string | null;
  seatIndex: number;
};
type Template = {
  id: string;
  name: string;
  vehicleItemTypeId: string;
  vehicleItemTypeName: string;
  vehicleSerialUnitId: string;
  vehicleSerial: string;
  slots: TemplateSlot[];
};
type Company = { id: string; name: string };

type SlotDraft = {
  dispatchRoleId: string;
  soldierId: string | null;
  seatIndex: number;
};

const ROLE_COLORS: Record<string, string> = {
  "נהג": "bg-blue-100 text-blue-800 border-blue-300",
  "מפקד": "bg-amber-100 text-amber-800 border-amber-300",
  "חובש": "bg-green-100 text-green-800 border-green-300",
};
const DEFAULT_COLOR = "bg-slate-100 text-slate-700 border-slate-300";

export default function TemplatesClient({
  vehicleTypes,
  vehicles,
  soldiers,
  companies,
  templates,
  drivingRefreshDays,
  dispatchRoles,
  companyRoles,
}: {
  vehicleTypes: VehicleType[];
  vehicles: Vehicle[];
  soldiers: Soldier[];
  companies: Company[];
  templates: Template[];
  drivingRefreshDays: number;
  dispatchRoles: DispatchRoleType[];
  companyRoles: CompanyRoleOption[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"templates" | "roles">("templates");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [vehicleTypeId, setVehicleTypeId] = useState("");
  const [vehicleSerialId, setVehicleSerialId] = useState("");
  const [slots, setSlots] = useState<SlotDraft[]>([]);
  const [search, setSearch] = useState("");
  const [soldierSearch, setSoldierSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [pending, startTransition] = useTransition();
  const [gapFilter, setGapFilter] = useState<string | null>(null);

  const roleMap = useMemo(() => {
    const m: Record<string, DispatchRoleType> = {};
    for (const r of dispatchRoles) m[r.id] = r;
    return m;
  }, [dispatchRoles]);

  const vehiclesForType = useMemo(
    () => vehicleTypeId ? vehicles.filter((v) => v.itemTypeId === vehicleTypeId) : [],
    [vehicles, vehicleTypeId],
  );

  const selectedVehicle = useMemo(() => vehicles.find((v) => v.id === vehicleSerialId), [vehicles, vehicleSerialId]);

  const canDrive = useCallback((soldier: Soldier) => {
    if (soldier.licenseIds.length === 0) return false;
    const veh = selectedVehicle || (vehicleTypeId ? vehicles.find((v) => v.itemTypeId === vehicleTypeId) : null);
    if (!veh || veh.requiredLicenseIds.length === 0) return true;
    return veh.requiredLicenseIds.some((lid) => soldier.licenseIds.includes(lid));
  }, [selectedVehicle, vehicleTypeId, vehicles]);

  // Gaps dashboard
  const gaps = useMemo(() => {
    const byRole: Record<string, { total: number; filled: number; templateIds: string[] }> = {};
    for (const r of dispatchRoles) byRole[r.id] = { total: 0, filled: 0, templateIds: [] };
    for (const t of templates) {
      for (const s of t.slots) {
        if (!byRole[s.dispatchRoleId]) continue;
        byRole[s.dispatchRoleId].total++;
        if (s.soldierId) {
          byRole[s.dispatchRoleId].filled++;
        } else {
          if (!byRole[s.dispatchRoleId].templateIds.includes(t.id)) {
            byRole[s.dispatchRoleId].templateIds.push(t.id);
          }
        }
      }
    }
    return byRole;
  }, [templates, dispatchRoles]);

  const hasAnyGap = useMemo(() => Object.values(gaps).some((g) => g.total > g.filled), [gaps]);

  const filteredTemplates = useMemo(() => {
    let list = templates;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) =>
        t.name.toLowerCase().includes(q) ||
        t.vehicleItemTypeName.toLowerCase().includes(q) ||
        t.vehicleSerial.toLowerCase().includes(q)
      );
    }
    if (gapFilter) {
      const tIds = gaps[gapFilter]?.templateIds ?? [];
      list = list.filter((t) => tIds.includes(t.id));
    }
    return list;
  }, [templates, search, gapFilter, gaps]);

  function openCreate() {
    setEditId(null);
    setName("");
    setVehicleTypeId("");
    setVehicleSerialId("");
    setSlots([]);
    setSoldierSearch("");
    setCompanyFilter("");
    setShowForm(true);
  }

  function openEdit(t: Template) {
    setEditId(t.id);
    setName(t.name);
    setVehicleTypeId(t.vehicleItemTypeId);
    setVehicleSerialId(t.vehicleSerialUnitId);
    setSlots(t.slots.map((s) => ({ dispatchRoleId: s.dispatchRoleId, soldierId: s.soldierId, seatIndex: s.seatIndex })));
    setSoldierSearch("");
    setCompanyFilter("");
    setShowForm(true);
  }

  function addSlot(roleId: string) {
    setSlots((prev) => [...prev, { dispatchRoleId: roleId, soldierId: null, seatIndex: prev.length }]);
  }

  function removeSlot(index: number) {
    setSlots((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, seatIndex: i })));
  }

  function assignSoldier(slotIndex: number, soldierId: string | null) {
    setSlots((prev) => prev.map((s, i) => i === slotIndex ? { ...s, soldierId } : s));
  }

  function handleSave() {
    const fd = new FormData();
    if (editId) fd.set("id", editId);
    fd.set("name", name);
    fd.set("vehicleItemTypeId", vehicleTypeId);
    fd.set("vehicleSerialUnitId", vehicleSerialId);
    fd.set("slots", JSON.stringify(slots));
    startTransition(async () => {
      const res = await saveTemplate(fd);
      if (res.ok) {
        setShowForm(false);
        router.refresh();
      } else {
        alert(res.error);
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm('למחוק את השבצ"ק הקבוע?')) return;
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      await deleteTemplate(fd);
      router.refresh();
    });
  }

  const filteredSoldiers = useMemo(() => {
    let list = soldiers;
    if (soldierSearch.trim()) {
      const q = soldierSearch.trim().toLowerCase();
      list = list.filter((s) =>
        s.fullName.toLowerCase().includes(q) ||
        (s.personalNumber && s.personalNumber.includes(q))
      );
    }
    if (companyFilter) list = list.filter((s) => s.companyId === companyFilter);
    return list;
  }, [soldiers, soldierSearch, companyFilter]);

  const assignedSoldierIds = useMemo(() => new Set(slots.map((s) => s.soldierId).filter(Boolean)), [slots]);
  const assignedSoldierMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of slots) {
      if (s.soldierId) {
        const role = roleMap[s.dispatchRoleId];
        m.set(s.soldierId, role?.name ?? "?");
      }
    }
    return m;
  }, [slots, roleMap]);

  // ========== TABS ==========
  const TABS = [
    { key: "templates" as const, label: 'שבצ"קים' },
    { key: "roles" as const, label: "ניהול תפקידים" },
  ];

  // ========== FORM ==========
  if (showForm) {
    return (
      <div className="space-y-4">
        {/* Tab bar — visible even in form */}
        <div className="flex gap-1 border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); if (t.key === "roles") setShowForm(false); }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                t.key === "templates" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">{editId ? 'עריכת שבצ"ק קבוע' : 'שבצ"ק קבוע חדש'}</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
          </div>

          {/* Name */}
          <div>
            <label className="text-sm font-medium block mb-1">שם</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="border rounded-lg px-3 py-2 text-sm w-full" placeholder='למשל: הממ"ר של פלוגה א' />
          </div>

          {/* Vehicle: type → serial */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">סוג רכב</label>
              <select
                value={vehicleTypeId}
                onChange={(e) => { setVehicleTypeId(e.target.value); setVehicleSerialId(""); }}
                className="border rounded-lg px-3 py-2 text-sm w-full"
              >
                <option value="">ללא רכב</option>
                {vehicleTypes.map((vt) => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
              </select>
            </div>
            {vehicleTypeId && (
              <div>
                <label className="text-sm font-medium block mb-1">מספר רכב (לא חובה)</label>
                <select
                  value={vehicleSerialId}
                  onChange={(e) => setVehicleSerialId(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm w-full"
                >
                  <option value="">כל רכב מסוג זה</option>
                  {vehiclesForType.map((v) => (
                    <option key={v.id} value={v.id}>{v.serialNumber}{v.holderName ? ` (${v.holderName})` : ""}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Slots */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h4 className="font-medium text-sm">תפקידים וחיילים</h4>
              <span className="text-xs text-slate-400">({slots.length} תפקידים, {slots.filter((s) => s.soldierId).length} משובצים)</span>
            </div>

            {/* Add role buttons */}
            <div className="flex flex-wrap gap-1 mb-3">
              {dispatchRoles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => addSlot(r.id)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-slate-200 hover:bg-slate-50 transition"
                >
                  <span>{r.icon}</span>
                  <span>+ {r.name}</span>
                </button>
              ))}
            </div>

            {/* Slot list */}
            {slots.length === 0 && (
              <div className="text-center text-sm text-slate-400 py-6 border-2 border-dashed rounded-xl">
                הוסף תפקידים מהכפתורים למעלה
              </div>
            )}

            <div className="space-y-2">
              {slots.map((slot, idx) => {
                const role = roleMap[slot.dispatchRoleId];
                const soldier = slot.soldierId ? soldiers.find((s) => s.id === slot.soldierId) : null;
                const color = role ? (ROLE_COLORS[role.name] || DEFAULT_COLOR) : DEFAULT_COLOR;
                return (
                  <div key={idx} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${color}`}>
                    <span className="text-sm">{role?.icon ?? "🎖️"}</span>
                    <span className="text-sm font-bold min-w-[60px]">{role?.name ?? "?"}</span>
                    <span className="text-slate-400">→</span>
                    {soldier ? (
                      <span className="text-sm font-medium flex-1">
                        {soldier.fullName}
                        {soldier.companyName && <span className="text-[10px] text-slate-500 mr-1">({soldier.companyName})</span>}
                      </span>
                    ) : (
                      <span className="text-sm text-slate-400 flex-1">חסר — בחר חייל</span>
                    )}
                    {/* Assign button */}
                    <SoldierPicker
                      soldiers={filteredSoldiers}
                      assignedIds={assignedSoldierIds}
                      assignedMap={assignedSoldierMap}
                      isDriverRole={role?.isDriver ?? false}
                      matchingCompanyRoleId={role?.companyRoleId ?? null}
                      canDrive={canDrive}
                      onSelect={(id) => assignSoldier(idx, id)}
                      onClear={() => assignSoldier(idx, null)}
                      hasSoldier={!!soldier}
                      search={soldierSearch}
                      setSearch={setSoldierSearch}
                      companyFilter={companyFilter}
                      setCompanyFilter={setCompanyFilter}
                      companies={companies}
                    />
                    <button onClick={() => removeSlot(idx)} className="text-rose-400 hover:text-rose-600 text-sm">✕</button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Save */}
          <div className="flex justify-end pt-2 border-t border-slate-200">
            <button onClick={handleSave} disabled={pending || !name} className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 shadow-md">
              {pending ? "שומר..." : '✅ שמור שבצ"ק'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========== MAIN LIST ==========
  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              tab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "roles" && (
        <CrudSection
          title="תפקידי שבצ״ק"
          addLabel="תפקיד"
          fields={[
            { name: "name", label: 'שם (למשל: נהג, חובש, מט"ב)' },
            { name: "icon", label: "אייקון", type: "emoji" as const, default: "🎖️" },
            { name: "companyRoleId", label: "תפקיד פלוגה מקושר", type: "select" as const, options: [{ value: "", label: "ללא" }, ...companyRoles.map((cr) => ({ value: cr.id, label: cr.name }))] },
            { name: "sortOrder", label: "סדר", type: "number" as const, default: "0" },
            { name: "isDriver", label: "תפקיד נהג?", type: "checkbox" as const },
          ]}
          saveAction={saveDispatchRole}
          deleteAction={toggleDispatchRole}
          rows={dispatchRoles.map((r) => ({
            id: r.id,
            values: { name: r.name, icon: r.icon, companyRoleId: r.companyRoleId ?? "", sortOrder: String(r.sortOrder), isDriver: r.isDriver ? "true" : "" },
            display: (
              <span className="flex items-center gap-2">
                <span>{r.icon}</span>
                <span className="font-medium">{r.name}</span>
                {r.isDriver && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 rounded">נהג</span>}
                {r.companyRoleId && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 rounded">🔗 {companyRoles.find((cr) => cr.id === r.companyRoleId)?.name}</span>}
              </span>
            ),
          }))}
        />
      )}

      {tab === "templates" && (
        <>
          {/* Gaps dashboard */}
          {templates.length > 0 && (
            <div className={`rounded-xl border p-3 ${hasAnyGap ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">{hasAnyGap ? "⚠️" : "✅"}</span>
                <span className="font-bold text-xs">{hasAnyGap ? 'פערים בשבצ"קים' : "הכל מאויש"}</span>
                <span className="text-[10px] text-slate-500 mr-auto">
                  {templates.length} רכבים · {templates.reduce((s, t) => s + t.slots.filter((sl) => sl.soldierId).length, 0)} משובצים
                </span>
                {gapFilter && (
                  <button onClick={() => setGapFilter(null)} className="text-[10px] text-blue-600 underline">הצג הכל</button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {dispatchRoles.map((r) => {
                  const g = gaps[r.id];
                  if (!g || g.total === 0) return null;
                  const missing = g.total - g.filled;
                  if (missing === 0) return null;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setGapFilter(gapFilter === r.id ? null : r.id)}
                      className={`rounded-lg px-3 py-2 text-center transition border ${
                        gapFilter === r.id ? "ring-2 ring-rose-500 bg-rose-100 border-rose-300" : "bg-white border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="text-lg font-bold text-rose-600">{missing}</div>
                      <div className="text-[10px] text-slate-600">{r.icon} חסרי {r.name}</div>
                    </button>
                  );
                })}
                {!hasAnyGap && <span className="text-xs text-emerald-600">כל התפקידים מאויישים</span>}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={openCreate} className="bg-blue-700 hover:bg-blue-800 text-white rounded-lg px-5 py-2.5 text-sm font-bold shadow-md hover:shadow-lg transition">
              + שבצ&quot;ק קבוע חדש
            </button>
            {templates.length > 3 && (
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 חיפוש..." className="border rounded-lg px-3 py-2 text-sm w-60" />
            )}
          </div>

          {filteredTemplates.length === 0 ? (
            <div className="text-sm text-slate-500 p-4">
              {gapFilter ? `אין רכבים עם חוסר בתפקיד זה` : 'אין שבצ"קים קבועים. צור חדש למעלה.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredTemplates.map((t) => (
                <TemplateCard key={t.id} template={t} onEdit={() => openEdit(t)} onDelete={() => handleDelete(t.id)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ========== Soldier Picker (dropdown per slot) ==========
function SoldierPicker({
  soldiers,
  assignedIds,
  assignedMap,
  isDriverRole,
  matchingCompanyRoleId,
  canDrive,
  onSelect,
  onClear,
  hasSoldier,
  search,
  setSearch,
  companyFilter,
  setCompanyFilter,
  companies,
}: {
  soldiers: Soldier[];
  assignedIds: Set<string | null>;
  assignedMap: Map<string, string>;
  isDriverRole: boolean;
  matchingCompanyRoleId: string | null;
  canDrive: (s: Soldier) => boolean;
  onSelect: (id: string) => void;
  onClear: () => void;
  hasSoldier: boolean;
  search: string;
  setSearch: (v: string) => void;
  companyFilter: string;
  setCompanyFilter: (v: string) => void;
  companies: Company[];
}) {
  const [open, setOpen] = useState(false);
  const [onlyMatching, setOnlyMatching] = useState(false);

  if (!open) {
    return (
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => { setOpen(true); setOnlyMatching(false); }}
          className="text-xs bg-white border border-slate-300 rounded px-2 py-1 hover:bg-slate-50"
        >
          {hasSoldier ? "🔄" : "👤 שבץ"}
        </button>
        {hasSoldier && (
          <button type="button" onClick={onClear} className="text-xs text-slate-400 hover:text-rose-500">✕</button>
        )}
      </div>
    );
  }

  const filtered = onlyMatching && matchingCompanyRoleId
    ? soldiers.filter((s) => s.companyRoleId === matchingCompanyRoleId)
    : soldiers;

  const sorted = matchingCompanyRoleId
    ? [...filtered].sort((a, b) => {
        const aMatch = a.companyRoleId === matchingCompanyRoleId ? 0 : 1;
        const bMatch = b.companyRoleId === matchingCompanyRoleId ? 0 : 1;
        return aMatch - bMatch;
      })
    : filtered;

  const matchCount = matchingCompanyRoleId
    ? soldiers.filter((s) => s.companyRoleId === matchingCompanyRoleId).length
    : 0;

  return (
    <div className="absolute left-0 top-full z-30 bg-white shadow-xl rounded-xl border border-slate-200 p-3 w-80 mt-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold">בחר חייל</span>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
      </div>
      <div className="flex gap-2 mb-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 שם / מ.א..."
          className="border rounded px-2 py-1 text-xs flex-1"
          autoFocus
        />
        <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="border rounded px-1 py-1 text-xs">
          <option value="">כל הפלוגות</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {matchingCompanyRoleId && (
        <label className="flex items-center gap-1.5 mb-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={onlyMatching}
            onChange={(e) => setOnlyMatching(e.target.checked)}
            className="w-3.5 h-3.5 accent-purple-600"
          />
          <span className="text-purple-700 font-medium">רק תפקיד תואם</span>
          <span className="text-[10px] text-slate-400">({matchCount})</span>
        </label>
      )}
      <div className="max-h-56 overflow-y-auto space-y-0.5">
        {sorted.map((s) => {
          const assigned = assignedIds.has(s.id);
          const assignedTo = assignedMap.get(s.id);
          const hasLicense = canDrive(s);
          const blocked = isDriverRole && !hasLicense;
          const isMatch = matchingCompanyRoleId && s.companyRoleId === matchingCompanyRoleId;
          return (
            <div
              key={s.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer ${
                assigned ? "opacity-40" : blocked ? "opacity-50" : "hover:bg-blue-50"
              } ${isMatch ? "bg-purple-50" : ""}`}
              onClick={() => {
                if (assigned) return;
                if (blocked) { alert(`ל${s.fullName} אין הרשאת נהיגה מתאימה`); return; }
                onSelect(s.id);
                setOpen(false);
              }}
            >
              {isMatch && <span className="text-[10px]">⭐</span>}
              <span className={assigned ? "line-through" : ""}>{s.fullName}</span>
              {s.personalNumber && <span className="text-[10px] text-slate-400 font-mono">{s.personalNumber}</span>}
              {s.companyName && <span className="text-[10px] text-slate-400">({s.companyName})</span>}
              {s.roleName && <span className="text-[10px] text-purple-600">{s.roleName}</span>}
              {s.licenseNames.length > 0 && <span className="text-[10px] text-green-600">🪪</span>}
              {blocked && <span className="text-[10px] text-rose-500">⚠️</span>}
              {assigned && assignedTo && <span className="text-[10px] text-blue-500 mr-auto">← {assignedTo}</span>}
            </div>
          );
        })}
        {sorted.length === 0 && (
          <div className="text-center text-xs text-slate-400 py-3">לא נמצאו חיילים</div>
        )}
      </div>
    </div>
  );
}

// ========== Template Card ==========
function TemplateCard({ template, onEdit, onDelete }: { template: Template; onEdit: () => void; onDelete: () => void }) {
  const filledSlots = template.slots.filter((s) => s.soldierId);
  const emptySlots = template.slots.filter((s) => !s.soldierId);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="bg-slate-800 text-white p-2 flex items-center justify-between">
        <div className="min-w-0">
          <div className="font-bold text-xs truncate">{template.name}</div>
          <div className="text-[10px] text-slate-300 font-mono">
            {template.vehicleItemTypeName
              ? `${template.vehicleItemTypeName}${template.vehicleSerial ? ` · ${template.vehicleSerial}` : ""}`
              : "ללא רכב"}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={onEdit} className="text-[10px] bg-slate-700 hover:bg-slate-600 rounded px-1.5 py-0.5">✏️</button>
          <button onClick={onDelete} className="text-[10px] bg-slate-700 hover:bg-rose-600 rounded px-1.5 py-0.5">🗑️</button>
        </div>
      </div>

      {/* Slots list */}
      <div className="p-2 space-y-1">
        {template.slots.map((s, i) => {
          const color = ROLE_COLORS[s.roleName] || DEFAULT_COLOR;
          return (
            <div key={i} className={`flex items-center gap-2 px-2 py-1 rounded text-xs border ${color}`}>
              <span>{s.roleIcon}</span>
              <span className="font-bold min-w-[50px]">{s.roleName}</span>
              <span className="text-slate-400">→</span>
              {s.soldierName ? (
                <span className="font-medium">{s.soldierName}</span>
              ) : (
                <span className="text-rose-500 font-medium">חסר</span>
              )}
            </div>
          );
        })}
        {template.slots.length === 0 && (
          <div className="text-xs text-slate-400 text-center py-2">אין תפקידים מוגדרים</div>
        )}
      </div>

      {/* Status bar */}
      <div className={`px-2 py-1.5 text-center text-[10px] border-t ${
        emptySlots.length > 0 ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"
      }`}>
        {emptySlots.length > 0 ? (
          <span>⚠️ {emptySlots.length} חסרים: {emptySlots.map((s) => `${s.roleIcon} ${s.roleName}`).join(" · ")}</span>
        ) : (
          <span>✅ מאויש · {filledSlots.length} משובצים</span>
        )}
      </div>
    </div>
  );
}
