"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { saveTemplate, deleteTemplate } from "./actions";

type Vehicle = {
  id: string;
  itemName: string;
  serialNumber: string;
  holderName: string | null;
};

type Soldier = {
  id: string;
  fullName: string;
  personalNumber: string | null;
  companyName: string | null;
  licenses: string[];
  signedEquipment: string[];
};

type Template = {
  id: string;
  name: string;
  vehicleSerialUnitId: string;
  vehicleName: string;
  vehicleSerial: string;
  soldiers: { id: string; fullName: string; personalNumber: string | null; companyName: string | null }[];
};

export default function TemplatesClient({
  vehicles,
  soldiers,
  templates,
}: {
  vehicles: Vehicle[];
  soldiers: Soldier[];
  templates: Template[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [selectedSoldiers, setSelectedSoldiers] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [soldierSearch, setSoldierSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function openCreate() {
    setEditId(null);
    setName("");
    setVehicleId("");
    setSelectedSoldiers([]);
    setShowForm(true);
  }

  function openEdit(t: Template) {
    setEditId(t.id);
    setName(t.name);
    setVehicleId(t.vehicleSerialUnitId);
    setSelectedSoldiers(t.soldiers.map((s) => s.id));
    setShowForm(true);
  }

  function handleSave() {
    const fd = new FormData();
    if (editId) fd.set("id", editId);
    fd.set("name", name);
    fd.set("vehicleSerialUnitId", vehicleId);
    fd.set("soldierIds", JSON.stringify(selectedSoldiers));
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
    if (!soldierSearch.trim()) return soldiers;
    const q = soldierSearch.trim().toLowerCase();
    return soldiers.filter((s) =>
      s.fullName.toLowerCase().includes(q) ||
      (s.personalNumber && s.personalNumber.includes(q)) ||
      (s.companyName && s.companyName.toLowerCase().includes(q))
    );
  }, [soldiers, soldierSearch]);

  if (showForm) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <h3 className="font-bold text-lg">{editId ? "עריכת שבצ\"ק קבוע" : "שבצ\"ק קבוע חדש"}</h3>

        <div>
          <label className="text-sm font-medium block mb-1">שם</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="border rounded-lg px-3 py-2 text-sm w-full max-w-sm" placeholder='למשל: הממ"ר של פלוגה א' />
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">רכב</label>
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm w-full max-w-sm">
            <option value="">בחר רכב...</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.itemName} - {v.serialNumber}{v.holderName ? ` (${v.holderName})` : ""}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">חיילים ({selectedSoldiers.length} נבחרו)</label>
          <input
            value={soldierSearch}
            onChange={(e) => setSoldierSearch(e.target.value)}
            placeholder="🔍 חיפוש חייל..."
            className="border rounded-lg px-3 py-2 text-sm w-full max-w-sm mb-2"
          />
          <div className="max-h-60 overflow-y-auto border rounded-lg p-2 space-y-0.5">
            {filteredSoldiers.map((s) => (
              <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedSoldiers.includes(s.id)}
                  onChange={() => {
                    setSelectedSoldiers((prev) =>
                      prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]
                    );
                  }}
                  className="rounded"
                />
                <span className="text-sm">{s.fullName}</span>
                {s.personalNumber && <span className="text-[10px] text-slate-400 font-mono">{s.personalNumber}</span>}
                {s.companyName && <span className="text-[10px] text-slate-400">({s.companyName})</span>}
                {s.licenses.length > 0 && (
                  <span className="text-[10px] text-green-600">🪪 {s.licenses.join(", ")}</span>
                )}
              </label>
            ))}
          </div>
        </div>

        {selectedSoldiers.length > 0 && (
          <div className="text-xs text-slate-500">
            נבחרו: {selectedSoldiers.map((sid) => soldiers.find((s) => s.id === sid)?.fullName).filter(Boolean).join(", ")}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button onClick={handleSave} disabled={pending} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
            {pending ? "שומר..." : "שמור"}
          </button>
          <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-200 rounded-lg text-sm">ביטול</button>
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
        <div className="grid gap-3">
          {filteredTemplates.map((t) => {
            const isExpanded = expandedId === t.id;
            return (
              <div key={t.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => setExpandedId(isExpanded ? null : t.id)} className="text-slate-400 hover:text-slate-600">
                    {isExpanded ? "▼" : "▶"}
                  </button>
                  <div className="flex-1">
                    <span className="font-bold">{t.name}</span>
                    <span className="text-sm text-slate-500 mr-2">🚗 {t.vehicleName} - {t.vehicleSerial}</span>
                    <span className="text-xs text-slate-400 mr-2">({t.soldiers.length} חיילים)</span>
                  </div>
                  <button onClick={() => openEdit(t)} className="text-xs text-blue-600 hover:underline">עריכה</button>
                  <button onClick={() => handleDelete(t.id)} className="text-xs text-rose-500 hover:underline">מחיקה</button>
                </div>
                {isExpanded && (
                  <div className="mt-3 mr-8 space-y-1">
                    {t.soldiers.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 text-sm py-1">
                        <span>{s.fullName}</span>
                        {s.personalNumber && <span className="text-xs text-slate-400 font-mono">{s.personalNumber}</span>}
                        {s.companyName && <span className="text-xs text-slate-400">({s.companyName})</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
