"use client";

import { useState, useTransition, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { saveTemplate, deleteTemplate } from "./actions";

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
  companyName: string | null;
  roleName: string | null;
  licenseIds: string[];
  licenseNames: string[];
};

type TemplateSoldier = {
  id: string;
  fullName: string;
  personalNumber: string | null;
  companyName: string | null;
  roleName: string | null;
  role: string;
  seatIndex: number;
};

type Template = {
  id: string;
  name: string;
  vehicleSerialUnitId: string;
  vehicleItemTypeId: string;
  vehicleName: string;
  vehicleSerial: string;
  soldiers: TemplateSoldier[];
};

type Company = { id: string; name: string };

type Assignment = {
  soldierId: string;
  role: string;
  seatIndex: number;
};

const ROLES = ["נהג", "מפקד", "חובש", "לוחם"] as const;
const ROLE_ICONS: Record<string, string> = { "נהג": "🚗", "מפקד": "⭐", "חובש": "🏥", "לוחם": "🎖️" };
const ROLE_COLORS: Record<string, string> = {
  "נהג": "bg-blue-100 text-blue-800 border-blue-300",
  "מפקד": "bg-amber-100 text-amber-800 border-amber-300",
  "חובש": "bg-green-100 text-green-800 border-green-300",
  "לוחם": "bg-slate-100 text-slate-700 border-slate-300",
};

export default function TemplatesClient({
  vehicles,
  soldiers,
  companies,
  templates,
}: {
  vehicles: Vehicle[];
  soldiers: Soldier[];
  companies: Company[];
  templates: Template[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [search, setSearch] = useState("");
  const [soldierSearch, setSoldierSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [addingRole, setAddingRole] = useState<string>("לוחם");
  const [pending, startTransition] = useTransition();

  const allAssignedSoldierIds = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of templates) {
      for (const s of t.soldiers) {
        map.set(s.id, t.name);
      }
    }
    return map;
  }, [templates]);

  const selectedVehicle = useMemo(() => vehicles.find((v) => v.id === vehicleId), [vehicles, vehicleId]);

  const canDrive = useCallback((soldier: Soldier) => {
    if (!selectedVehicle || selectedVehicle.requiredLicenseIds.length === 0) return true;
    return selectedVehicle.requiredLicenseIds.some((lid) => soldier.licenseIds.includes(lid));
  }, [selectedVehicle]);

  function openCreate() {
    setEditId(null);
    setName("");
    setVehicleId("");
    setAssignments([]);
    setSoldierSearch("");
    setCompanyFilter("");
    setRoleFilter("");
    setShowForm(true);
  }

  function openEdit(t: Template) {
    setEditId(t.id);
    setName(t.name);
    setVehicleId(t.vehicleSerialUnitId);
    setAssignments(t.soldiers.map((s) => ({ soldierId: s.id, role: s.role, seatIndex: s.seatIndex })));
    setSoldierSearch("");
    setCompanyFilter("");
    setRoleFilter("");
    setShowForm(true);
  }

  function addSoldier(soldierId: string) {
    if (assignments.some((a) => a.soldierId === soldierId)) return;
    setAssignments((prev) => [...prev, { soldierId, role: addingRole, seatIndex: prev.length }]);
  }

  function removeSoldier(soldierId: string) {
    setAssignments((prev) => prev.filter((a) => a.soldierId !== soldierId).map((a, i) => ({ ...a, seatIndex: i })));
  }

  function changeRole(soldierId: string, role: string) {
    setAssignments((prev) => prev.map((a) => a.soldierId === soldierId ? { ...a, role } : a));
  }

  function handleSave() {
    const fd = new FormData();
    if (editId) fd.set("id", editId);
    fd.set("name", name);
    fd.set("vehicleSerialUnitId", vehicleId);
    fd.set("assignments", JSON.stringify(assignments));
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
    if (!confirm("למחוק את השבצ\"ק הקבוע?")) return;
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      await deleteTemplate(fd);
      router.refresh();
    });
  }

  const filteredTemplates = search.trim()
    ? templates.filter((t) =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.vehicleName.toLowerCase().includes(search.toLowerCase()) ||
        t.vehicleSerial.toLowerCase().includes(search.toLowerCase())
      )
    : templates;

  const filteredSoldiers = useMemo(() => {
    let list = soldiers;
    if (soldierSearch.trim()) {
      const q = soldierSearch.trim().toLowerCase();
      list = list.filter((s) =>
        s.fullName.toLowerCase().includes(q) ||
        (s.personalNumber && s.personalNumber.includes(q))
      );
    }
    if (companyFilter) {
      list = list.filter((s) => s.companyId === companyFilter);
    }
    if (roleFilter) {
      list = list.filter((s) => s.roleName && s.roleName.toLowerCase().includes(roleFilter.toLowerCase()));
    }
    return list;
  }, [soldiers, soldierSearch, companyFilter, roleFilter]);

  if (showForm) {
    const assignedSoldiers = assignments.map((a) => ({
      ...a,
      soldier: soldiers.find((s) => s.id === a.soldierId)!,
    })).filter((a) => a.soldier);

    const driver = assignedSoldiers.find((a) => a.role === "נהג");
    const commander = assignedSoldiers.find((a) => a.role === "מפקד");
    const medics = assignedSoldiers.filter((a) => a.role === "חובש");
    const fighters = assignedSoldiers.filter((a) => a.role === "לוחם");

    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          <h3 className="font-bold text-lg">{editId ? "עריכת שבצ\"ק קבוע" : "שבצ\"ק קבוע חדש"}</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">שם</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="border rounded-lg px-3 py-2 text-sm w-full" placeholder='למשל: הממ"ר של פלוגה א' />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">רכב</label>
              <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm w-full">
                <option value="">בחר רכב...</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.itemName} - {v.serialNumber}{v.holderName ? ` (${v.holderName})` : ""}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Visual vehicle layout */}
          {assignments.length > 0 && (
            <VehicleLayout
              driver={driver}
              commander={commander}
              medics={medics}
              fighters={fighters}
              vehicleName={selectedVehicle?.itemName || ""}
              vehicleSerial={selectedVehicle?.serialNumber || ""}
              onRemove={removeSoldier}
              onChangeRole={changeRole}
            />
          )}

          {/* Add soldiers section */}
          <div className="border rounded-xl p-3 bg-slate-50">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <label className="text-sm font-medium">הוסף חיילים</label>
              <span className="text-xs text-slate-400">({assignments.length} משובצים)</span>
              <select value={addingRole} onChange={(e) => setAddingRole(e.target.value)} className="border rounded px-2 py-1 text-xs mr-auto">
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_ICONS[r]} {r}</option>)}
              </select>
            </div>

            <div className="flex gap-2 mb-2 flex-wrap">
              <input
                value={soldierSearch}
                onChange={(e) => setSoldierSearch(e.target.value)}
                placeholder="🔍 שם / מ.א..."
                className="border rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[140px]"
              />
              <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
                <option value="">כל הפלוגות</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                placeholder="סנן תפקיד..."
                className="border rounded-lg px-2 py-1.5 text-sm w-28"
              />
            </div>

            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {filteredSoldiers.map((s) => {
                const isAssigned = assignments.some((a) => a.soldierId === s.id);
                const otherTemplate = allAssignedSoldierIds.get(s.id);
                const isInOtherTemplate = !!otherTemplate && (!editId || !templates.find((t) => t.id === editId)?.soldiers.some((ts) => ts.id === s.id));
                const hasLicense = canDrive(s);
                const isDriverRole = addingRole === "נהג";

                return (
                  <div
                    key={s.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm ${
                      isAssigned ? "bg-blue-50 opacity-50" : "hover:bg-white cursor-pointer"
                    } ${isDriverRole && !hasLicense ? "opacity-60" : ""}`}
                    onClick={() => {
                      if (isAssigned) return;
                      if (isDriverRole && !hasLicense) {
                        alert(`ל${s.fullName} אין הרשאת נהיגה מתאימה לרכב זה`);
                        return;
                      }
                      if (isInOtherTemplate) {
                        if (!confirm(`${s.fullName} כבר משובצ/ת בשבצ"ק "${otherTemplate}". להוסיף בכל זאת?`)) return;
                      }
                      addSoldier(s.id);
                    }}
                  >
                    <span className={isAssigned ? "line-through" : ""}>{s.fullName}</span>
                    {s.personalNumber && <span className="text-[10px] text-slate-400 font-mono">{s.personalNumber}</span>}
                    {s.companyName && <span className="text-[10px] text-slate-400">({s.companyName})</span>}
                    {s.roleName && <span className="text-[10px] text-purple-500">{s.roleName}</span>}
                    {s.licenseNames.length > 0 && <span className="text-[10px] text-green-600">🪪 {s.licenseNames.join(", ")}</span>}
                    {isDriverRole && !hasLicense && <span className="text-[10px] text-rose-500">⚠️ אין הרשאה</span>}
                    {isInOtherTemplate && <span className="text-[10px] text-amber-600">⚠️ משובץ ב-{otherTemplate}</span>}
                    {isAssigned && <span className="text-[10px] text-blue-500 mr-auto">✓ משובץ</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} disabled={pending || !name || !vehicleId || assignments.length === 0} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
              {pending ? "שומר..." : "שמור"}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-200 rounded-lg text-sm">ביטול</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          + שבצ&quot;ק קבוע חדש
        </button>
        {templates.length > 3 && (
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 חיפוש..." className="border rounded-lg px-3 py-2 text-sm w-60" />
        )}
      </div>

      {filteredTemplates.length === 0 ? (
        <div className="text-sm text-slate-500 p-4">אין שבצ&quot;קים קבועים. צור חדש למעלה.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredTemplates.map((t) => (
            <TemplateCard key={t.id} template={t} onEdit={() => openEdit(t)} onDelete={() => handleDelete(t.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function VehicleLayout({
  driver,
  commander,
  medics,
  fighters,
  vehicleName,
  vehicleSerial,
  onRemove,
  onChangeRole,
}: {
  driver?: { soldier: Soldier; role: string };
  commander?: { soldier: Soldier; role: string };
  medics: { soldier: Soldier; role: string }[];
  fighters: { soldier: Soldier; role: string }[];
  vehicleName: string;
  vehicleSerial: string;
  onRemove: (id: string) => void;
  onChangeRole: (id: string, role: string) => void;
}) {
  return (
    <div className="bg-gradient-to-b from-slate-50 to-slate-100 rounded-xl border-2 border-slate-300 p-4 relative">
      <div className="text-center text-xs text-slate-400 mb-3">{vehicleName} {vehicleSerial && `(${vehicleSerial})`}</div>

      <div className="relative mx-auto max-w-md">
        <div className="flex justify-center mb-2">
          <div className="text-[10px] text-slate-400 mb-1">קדמת הרכב ▲</div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="relative">
            {driver ? (
              <SeatCard
                name={driver.soldier.fullName}
                role="נהג"
                icon="🚗"
                color={ROLE_COLORS["נהג"]}
                onRemove={() => onRemove(driver.soldier.id)}
                onChangeRole={(r) => onChangeRole(driver.soldier.id, r)}
                isDriver
              />
            ) : (
              <div className="border-2 border-dashed border-blue-300 rounded-lg p-3 text-center text-xs text-blue-400 bg-blue-50/50">
                🚗 נהג (חסר)
              </div>
            )}
          </div>
          <div>
            {commander ? (
              <SeatCard
                name={commander.soldier.fullName}
                role="מפקד"
                icon="⭐"
                color={ROLE_COLORS["מפקד"]}
                onRemove={() => onRemove(commander.soldier.id)}
                onChangeRole={(r) => onChangeRole(commander.soldier.id, r)}
              />
            ) : (
              <div className="border border-dashed border-slate-200 rounded-lg p-3 text-center text-xs text-slate-300">
                מושב פנוי
              </div>
            )}
          </div>
        </div>

        {(medics.length > 0 || fighters.length > 0) && (
          <>
            <div className="border-t border-slate-300 my-2" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[...medics, ...fighters].map(({ soldier, role }) => (
                <SeatCard
                  key={soldier.id}
                  name={soldier.fullName}
                  role={role}
                  icon={ROLE_ICONS[role] || "🎖️"}
                  color={ROLE_COLORS[role] || ROLE_COLORS["לוחם"]}
                  onRemove={() => onRemove(soldier.id)}
                  onChangeRole={(r) => onChangeRole(soldier.id, r)}
                />
              ))}
            </div>
          </>
        )}

        <div className="flex justify-center mt-2">
          <div className="text-[10px] text-slate-400">▼ אחורי הרכב</div>
        </div>
      </div>
    </div>
  );
}

function SeatCard({
  name,
  role,
  icon,
  color,
  onRemove,
  onChangeRole,
  isDriver,
}: {
  name: string;
  role: string;
  icon: string;
  color: string;
  onRemove: () => void;
  onChangeRole: (role: string) => void;
  isDriver?: boolean;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className={`border rounded-lg p-2 text-xs relative ${color}`}>
      <div className="flex items-center gap-1 mb-0.5">
        <span>{icon}</span>
        <span className="font-bold truncate flex-1">{name}</span>
        <button onClick={onRemove} className="text-rose-400 hover:text-rose-600 text-[10px]">✕</button>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="text-[10px] underline opacity-70 hover:opacity-100"
        >
          {role}
        </button>
        {showMenu && (
          <div className="absolute top-full right-0 z-20 bg-white shadow-lg rounded-lg border p-1 mt-1 min-w-[80px]">
            {ROLES.filter((r) => r !== role).map((r) => (
              <button
                key={r}
                onClick={() => { onChangeRole(r); setShowMenu(false); }}
                className="block w-full text-right text-[10px] px-2 py-1 hover:bg-slate-100 rounded"
              >
                {ROLE_ICONS[r]} {r}
              </button>
            ))}
          </div>
        )}
      </div>
      {isDriver && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
          <span className="text-white text-[8px]">🔑</span>
        </div>
      )}
    </div>
  );
}

function TemplateCard({ template, onEdit, onDelete }: { template: Template; onEdit: () => void; onDelete: () => void }) {
  const driver = template.soldiers.find((s) => s.role === "נהג");
  const commander = template.soldiers.find((s) => s.role === "מפקד");
  const back = template.soldiers.filter((s) => s.role !== "נהג" && s.role !== "מפקד");

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="bg-slate-800 text-white p-3 flex items-center justify-between">
        <div className="min-w-0">
          <div className="font-bold text-sm truncate">{template.name}</div>
          <div className="text-[11px] text-slate-300 font-mono">{template.vehicleName} · {template.vehicleSerial}</div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button onClick={onEdit} className="text-[11px] bg-slate-700 hover:bg-slate-600 rounded px-2 py-1">✏️</button>
          <button onClick={onDelete} className="text-[11px] bg-slate-700 hover:bg-rose-600 rounded px-2 py-1">🗑️</button>
        </div>
      </div>

      {/* Vehicle visual */}
      <div className="p-3">
        <div className="relative border-2 border-slate-300 rounded-xl bg-gradient-to-b from-slate-50 to-slate-100 overflow-hidden">
          {/* Vehicle shape indicator */}
          <div className="bg-slate-200 text-center py-1 text-[10px] text-slate-500 font-medium">▲ קדמת הרכב</div>

          {/* Front row: driver + commander */}
          <div className="grid grid-cols-2 gap-1.5 p-2">
            <VehicleSeat name={driver?.fullName} role="נהג" icon="🚗" accent="blue" />
            <VehicleSeat name={commander?.fullName} role="מפקד" icon="⭐" accent="amber" />
          </div>

          {/* Back rows */}
          {back.length > 0 && (
            <>
              <div className="border-t-2 border-dashed border-slate-300 mx-2" />
              <div className="grid grid-cols-2 gap-1.5 p-2">
                {back.map((s) => (
                  <VehicleSeat key={s.id} name={s.fullName} role={s.role} icon={ROLE_ICONS[s.role] || "🎖️"} accent="slate" />
                ))}
              </div>
            </>
          )}

          <div className="bg-slate-200 text-center py-1 text-[10px] text-slate-500 font-medium">▼ אחורי הרכב</div>
        </div>

        <div className="mt-2 text-center text-[11px] text-slate-400">
          {template.soldiers.length} משובצים
          {!driver && <span className="text-rose-500 font-medium mr-2">· ⚠️ חסר נהג</span>}
        </div>
      </div>
    </div>
  );
}

function VehicleSeat({ name, role, icon, accent }: { name?: string; role: string; icon: string; accent: string }) {
  const colors: Record<string, string> = {
    blue: name ? "bg-blue-100 border-blue-300 text-blue-900" : "bg-blue-50/50 border-dashed border-blue-200 text-blue-300",
    amber: name ? "bg-amber-100 border-amber-300 text-amber-900" : "bg-amber-50/50 border-dashed border-amber-200 text-amber-300",
    green: name ? "bg-green-100 border-green-300 text-green-900" : "bg-green-50/50 border-dashed border-green-200 text-green-300",
    slate: name ? "bg-slate-100 border-slate-300 text-slate-800" : "bg-slate-50/50 border-dashed border-slate-200 text-slate-300",
  };
  return (
    <div className={`border rounded-lg p-1.5 text-[11px] ${colors[accent] || colors.slate}`}>
      <div className="flex items-center gap-1">
        <span className="text-sm">{icon}</span>
        <span className="font-medium truncate">{name || "—"}</span>
      </div>
      <div className="text-[10px] opacity-60 mr-5">{role}</div>
    </div>
  );
}
