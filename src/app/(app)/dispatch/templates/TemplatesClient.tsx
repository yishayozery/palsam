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
            <button onClick={handleSave} disabled={pending || !name || !vehicleId} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
              {pending ? "שומר..." : "שמור"}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-200 rounded-lg text-sm">ביטול</button>
          </div>
        </div>
      </div>
    );
  }

  // Gaps dashboard
  const gaps = useMemo(() => {
    let missingDriver = 0, missingCommander = 0, missingMedic = 0, totalSoldiers = 0;
    for (const t of templates) {
      if (!t.soldiers.some((s) => s.role === "נהג")) missingDriver++;
      if (!t.soldiers.some((s) => s.role === "מפקד")) missingCommander++;
      if (!t.soldiers.some((s) => s.role === "חובש")) missingMedic++;
      totalSoldiers += t.soldiers.length;
    }
    return { missingDriver, missingCommander, missingMedic, totalSoldiers, total: templates.length };
  }, [templates]);

  const hasGaps = gaps.missingDriver > 0 || gaps.missingCommander > 0 || gaps.missingMedic > 0;

  return (
    <div className="space-y-4">
      {/* Gaps dashboard */}
      {templates.length > 0 && (
        <div className={`rounded-xl border p-4 ${hasGaps ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">{hasGaps ? "⚠️" : "✅"}</span>
            <span className="font-bold text-sm">{hasGaps ? "יש פערים בשבצ\"קים" : "כל השבצ\"קים מאוישים"}</span>
            <span className="text-xs text-slate-500 mr-auto">{gaps.total} רכבים · {gaps.totalSoldiers} חיילים משובצים</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className={`rounded-lg p-2.5 text-center ${gaps.missingDriver > 0 ? "bg-rose-100 border border-rose-300" : "bg-white border border-slate-200"}`}>
              <div className="text-2xl font-bold">{gaps.missingDriver > 0 ? gaps.missingDriver : "✓"}</div>
              <div className="text-[11px] text-slate-600">🚗 חסרי נהג</div>
            </div>
            <div className={`rounded-lg p-2.5 text-center ${gaps.missingCommander > 0 ? "bg-amber-100 border border-amber-300" : "bg-white border border-slate-200"}`}>
              <div className="text-2xl font-bold">{gaps.missingCommander > 0 ? gaps.missingCommander : "✓"}</div>
              <div className="text-[11px] text-slate-600">⭐ חסרי מפקד</div>
            </div>
            <div className={`rounded-lg p-2.5 text-center ${gaps.missingMedic > 0 ? "bg-yellow-100 border border-yellow-300" : "bg-white border border-slate-200"}`}>
              <div className="text-2xl font-bold">{gaps.missingMedic > 0 ? gaps.missingMedic : "✓"}</div>
              <div className="text-[11px] text-slate-600">🏥 חסרי חובש</div>
            </div>
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
  const medic = template.soldiers.find((s) => s.role === "חובש");
  const back = template.soldiers.filter((s) => s.role !== "נהג" && s.role !== "מפקד");
  const missingRoles: string[] = [];
  if (!driver) missingRoles.push("נהג");
  if (!commander) missingRoles.push("מפקד");
  if (!medic) missingRoles.push("חובש");

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

      {/* Vehicle top-down view */}
      <div className="p-4 flex justify-center">
        <div className="relative w-48">
          {/* Vehicle body */}
          <div className="relative bg-gradient-to-b from-slate-700 via-slate-600 to-slate-700 rounded-t-[2rem] rounded-b-2xl border-2 border-slate-500 overflow-hidden shadow-lg">
            {/* Windshield */}
            <div className="bg-sky-200/60 border-b-2 border-slate-400 pt-3 pb-1 px-2">
              <div className="bg-sky-300/40 rounded-t-xl h-3 mx-4 border border-sky-400/50" />
            </div>

            {/* Hood accent */}
            <div className="h-1 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 mx-6" />

            {/* Front seats: driver + commander */}
            <div className="grid grid-cols-2 gap-2 p-3 pb-2">
              <SeatBubble name={driver?.fullName} role="נהג" icon="🚗" filled={!!driver} color="blue" />
              <SeatBubble name={commander?.fullName} role="מפקד" icon="⭐" filled={!!commander} color="amber" />
            </div>

            {/* Divider */}
            <div className="flex items-center gap-1 px-3">
              <div className="flex-1 border-t border-dashed border-slate-400" />
              <span className="text-[8px] text-slate-400">מושבים אחוריים</span>
              <div className="flex-1 border-t border-dashed border-slate-400" />
            </div>

            {/* Back seats */}
            <div className="grid grid-cols-2 gap-2 p-3 pt-2">
              {back.length > 0 ? back.map((s) => (
                <SeatBubble key={s.id} name={s.fullName} role={s.role} icon={ROLE_ICONS[s.role] || "🎖️"} filled color={s.role === "חובש" ? "green" : "slate"} />
              )) : (
                <>
                  <SeatBubble role="חובש" icon="🏥" filled={false} color="green" />
                  <SeatBubble role="לוחם" icon="🎖️" filled={false} color="slate" />
                </>
              )}
            </div>

            {/* Tailgate */}
            <div className="h-2 bg-gradient-to-r from-rose-500 via-rose-400 to-rose-500 mx-4 mb-2 rounded-full opacity-70" />
          </div>

          {/* Wheels */}
          <div className="absolute top-12 -right-2.5 w-5 h-8 bg-slate-900 rounded-full border-2 border-slate-600" />
          <div className="absolute top-12 -left-2.5 w-5 h-8 bg-slate-900 rounded-full border-2 border-slate-600" />
          <div className="absolute bottom-8 -right-2.5 w-5 h-8 bg-slate-900 rounded-full border-2 border-slate-600" />
          <div className="absolute bottom-8 -left-2.5 w-5 h-8 bg-slate-900 rounded-full border-2 border-slate-600" />

          {/* Side mirrors */}
          <div className="absolute top-10 -right-4 w-2 h-3 bg-slate-500 rounded-sm" />
          <div className="absolute top-10 -left-4 w-2 h-3 bg-slate-500 rounded-sm" />
        </div>
      </div>

      {/* Status bar */}
      <div className={`px-3 py-2 text-center text-[11px] border-t ${missingRoles.length > 0 ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`}>
        {missingRoles.length > 0 ? (
          <span>⚠️ חסרים: {missingRoles.map((r) => `${ROLE_ICONS[r]} ${r}`).join(" · ")}</span>
        ) : (
          <span>✅ מאויש מלא · {template.soldiers.length} משובצים</span>
        )}
      </div>
    </div>
  );
}

function SeatBubble({ name, role, icon, filled, color }: { name?: string; role: string; icon: string; filled: boolean; color: string }) {
  const filledColors: Record<string, string> = {
    blue: "bg-blue-500 text-white border-blue-300 shadow-blue-500/30",
    amber: "bg-amber-500 text-white border-amber-300 shadow-amber-500/30",
    green: "bg-emerald-500 text-white border-emerald-300 shadow-emerald-500/30",
    slate: "bg-slate-500 text-white border-slate-300 shadow-slate-500/30",
  };
  const emptyColors: Record<string, string> = {
    blue: "border-dashed border-blue-400/60 text-blue-300",
    amber: "border-dashed border-amber-400/60 text-amber-300",
    green: "border-dashed border-emerald-400/60 text-emerald-300",
    slate: "border-dashed border-slate-400/60 text-slate-400",
  };
  return (
    <div className={`rounded-lg border p-1.5 text-center transition ${
      filled ? `${filledColors[color]} shadow-md` : `bg-slate-700/50 ${emptyColors[color]}`
    }`}>
      <div className="text-sm leading-none">{icon}</div>
      <div className="text-[9px] font-bold truncate mt-0.5 leading-tight">{name || role}</div>
      {filled && name && <div className="text-[8px] opacity-70 leading-tight">{role}</div>}
    </div>
  );
}
