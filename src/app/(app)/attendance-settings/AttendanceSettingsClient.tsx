"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Table, Th, Td, EmptyState } from "@/components/ui";
import {
  upsertAttendanceStatus,
  deleteAttendanceStatus,
  toggleAttendanceStatus,
  upsertSquad,
  deleteSquad,
} from "./actions";

type Status = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  isPresent: boolean;
  sortOrder: number;
  active: boolean;
};
type Company = { id: string; name: string };
type SquadRow = {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  sortOrder: number;
  soldierCount: number;
};

const PRESET_STATUSES = [
  { name: "נוכח", color: "#10b981", icon: "✅", isPresent: true },
  { name: "חופשה", color: "#6366f1", icon: "🏖️", isPresent: false },
  { name: "מחלה", color: "#f59e0b", icon: "🤒", isPresent: false },
  { name: 'ח.מ. (חופשה מיוחדת)', color: "#8b5cf6", icon: "📋", isPresent: false },
  { name: "מילואים", color: "#3b82f6", icon: "🎖️", isPresent: false },
  { name: "קורס", color: "#0ea5e9", icon: "📚", isPresent: false },
  { name: "עצור/כלוא", color: "#ef4444", icon: "🔒", isPresent: false },
  { name: 'נפקד (נע"ל)', color: "#dc2626", icon: "❌", isPresent: false },
];

export default function AttendanceSettingsClient({
  statuses,
  companies,
  squads,
}: {
  statuses: Status[];
  companies: Company[];
  squads: SquadRow[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ===== סטטוסים =====
  const [showStatusForm, setShowStatusForm] = useState(false);
  const [editStatus, setEditStatus] = useState<Status | null>(null);
  const [statusName, setStatusName] = useState("");
  const [statusColor, setStatusColor] = useState("#10b981");
  const [statusIcon, setStatusIcon] = useState("");
  const [statusIsPresent, setStatusIsPresent] = useState(false);
  const [statusOrder, setStatusOrder] = useState(0);

  // ===== מחלקות =====
  const [showSquadForm, setShowSquadForm] = useState(false);
  const [squadName, setSquadName] = useState("");
  const [squadCompanyId, setSquadCompanyId] = useState(companies[0]?.id ?? "");
  const [squadOrder, setSquadOrder] = useState(0);

  function openStatusForm(s?: Status) {
    if (s) {
      setEditStatus(s);
      setStatusName(s.name);
      setStatusColor(s.color);
      setStatusIcon(s.icon ?? "");
      setStatusIsPresent(s.isPresent);
      setStatusOrder(s.sortOrder);
    } else {
      setEditStatus(null);
      setStatusName("");
      setStatusColor("#10b981");
      setStatusIcon("");
      setStatusIsPresent(false);
      setStatusOrder(statuses.length);
    }
    setShowStatusForm(true);
    setError("");
  }

  async function saveStatus() {
    setSaving(true);
    setError("");
    const fd = new FormData();
    if (editStatus) fd.append("id", editStatus.id);
    fd.append("name", statusName);
    fd.append("color", statusColor);
    fd.append("icon", statusIcon);
    fd.append("isPresent", String(statusIsPresent));
    fd.append("sortOrder", String(statusOrder));
    const res = await upsertAttendanceStatus(fd);
    setSaving(false);
    if (res?.error) { setError(res.error); return; }
    setShowStatusForm(false);
    router.refresh();
  }

  async function handleDeleteStatus(id: string) {
    if (!confirm("למחוק סטטוס?")) return;
    const res = await deleteAttendanceStatus(id);
    if (res?.error) { setError(res.error); return; }
    router.refresh();
  }

  async function handleToggleStatus(id: string, active: boolean) {
    await toggleAttendanceStatus(id, active);
    router.refresh();
  }

  async function seedPresets() {
    setSaving(true);
    for (let i = 0; i < PRESET_STATUSES.length; i++) {
      const p = PRESET_STATUSES[i];
      const exists = statuses.some((s) => s.name === p.name);
      if (exists) continue;
      const fd = new FormData();
      fd.append("name", p.name);
      fd.append("color", p.color);
      fd.append("icon", p.icon);
      fd.append("isPresent", String(p.isPresent));
      fd.append("sortOrder", String(i));
      await upsertAttendanceStatus(fd);
    }
    setSaving(false);
    router.refresh();
  }

  // ===== מחלקות =====
  async function saveSquad() {
    setSaving(true);
    setError("");
    const fd = new FormData();
    fd.append("companyId", squadCompanyId);
    fd.append("name", squadName);
    fd.append("sortOrder", String(squadOrder));
    const res = await upsertSquad(fd);
    setSaving(false);
    if (res?.error) { setError(res.error); return; }
    setShowSquadForm(false);
    setSquadName("");
    router.refresh();
  }

  async function handleDeleteSquad(id: string) {
    if (!confirm("למחוק מחלקה?")) return;
    const res = await deleteSquad(id);
    if (res?.error) { alert(res.error); return; }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error && <div className="bg-rose-50 text-rose-700 rounded-lg px-4 py-2 text-sm">{error}</div>}

      {/* ===== סטטוסי נוכחות ===== */}
      <Card>
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">📊 סטטוסי נוכחות</h2>
          <div className="flex gap-2">
            {statuses.length === 0 && (
              <button onClick={seedPresets} disabled={saving}
                className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg px-3 py-1.5 disabled:opacity-50">
                טען ברירות מחדל
              </button>
            )}
            <button onClick={() => openStatusForm()}
              className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5">
              ＋ הוסף סטטוס
            </button>
          </div>
        </div>

        {showStatusForm && (
          <div className="p-4 bg-blue-50 border-b border-blue-200">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">שם</label>
                <input value={statusName} onChange={(e) => setStatusName(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm w-40" />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">צבע</label>
                <input type="color" value={statusColor} onChange={(e) => setStatusColor(e.target.value)}
                  className="h-8 w-10 rounded border border-slate-300 cursor-pointer" />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">אייקון</label>
                <input value={statusIcon} onChange={(e) => setStatusIcon(e.target.value)} placeholder="✅"
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm w-16" />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">סדר</label>
                <input type="number" value={statusOrder} onChange={(e) => setStatusOrder(parseInt(e.target.value, 10) || 0)}
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm w-16 text-center font-mono" />
              </div>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="checkbox" checked={statusIsPresent} onChange={(e) => setStatusIsPresent(e.target.checked)}
                  className="rounded" />
                נחשב נוכח
              </label>
              <button onClick={saveStatus} disabled={saving || !statusName.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5 text-sm disabled:opacity-50">
                {editStatus ? "עדכן" : "שמור"}
              </button>
              <button onClick={() => setShowStatusForm(false)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm">ביטול</button>
            </div>
          </div>
        )}

        {statuses.length === 0 ? (
          <EmptyState>לא הוגדרו סטטוסים. לחץ &quot;טען ברירות מחדל&quot; להתחלה מהירה.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>סדר</Th><Th>סטטוס</Th><Th>צבע</Th><Th>נוכח?</Th><Th>פעיל</Th><Th>פעולות</Th></tr>
            </thead>
            <tbody>
              {statuses.map((s) => (
                <tr key={s.id} className={!s.active ? "opacity-50" : ""}>
                  <Td className="font-mono text-xs">{s.sortOrder}</Td>
                  <Td>
                    <span className="font-medium">{s.icon && `${s.icon} `}{s.name}</span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full inline-block border border-slate-200" style={{ backgroundColor: s.color }} />
                      <span className="text-[10px] font-mono text-slate-400">{s.color}</span>
                    </div>
                  </Td>
                  <Td>{s.isPresent ? "✅" : "—"}</Td>
                  <Td>
                    <button onClick={() => handleToggleStatus(s.id, !s.active)}
                      className={`text-xs rounded-full px-2 py-0.5 ${s.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                      {s.active ? "פעיל" : "כבוי"}
                    </button>
                  </Td>
                  <Td>
                    <button onClick={() => openStatusForm(s)} className="text-xs text-blue-600 hover:text-blue-800 ml-2">✏️ ערוך</button>
                    <button onClick={() => handleDeleteStatus(s.id)} className="text-xs text-rose-600 hover:text-rose-800">🗑️ מחק</button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* ===== מחלקות ===== */}
      <Card>
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">🪖 מחלקות</h2>
          <button onClick={() => { setShowSquadForm(true); setError(""); }}
            className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5">
            ＋ הוסף מחלקה
          </button>
        </div>

        {showSquadForm && (
          <div className="p-4 bg-blue-50 border-b border-blue-200">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">פלוגה</label>
                <select value={squadCompanyId} onChange={(e) => setSquadCompanyId(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">שם מחלקה</label>
                <input value={squadName} onChange={(e) => setSquadName(e.target.value)} placeholder='מחלקה א׳'
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm w-40" />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">סדר</label>
                <input type="number" value={squadOrder} onChange={(e) => setSquadOrder(parseInt(e.target.value, 10) || 0)}
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm w-16 text-center font-mono" />
              </div>
              <button onClick={saveSquad} disabled={saving || !squadName.trim() || !squadCompanyId}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5 text-sm disabled:opacity-50">
                שמור
              </button>
              <button onClick={() => setShowSquadForm(false)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm">ביטול</button>
            </div>
          </div>
        )}

        {squads.length === 0 ? (
          <EmptyState>לא הוגדרו מחלקות. הוסף מחלקות כדי לקבץ חיילים בנוכחות.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>פלוגה</Th><Th>מחלקה</Th><Th>סדר</Th><Th>חיילים</Th><Th>פעולות</Th></tr>
            </thead>
            <tbody>
              {squads.map((s) => (
                <tr key={s.id}>
                  <Td className="text-sm">{s.companyName}</Td>
                  <Td className="font-medium">{s.name}</Td>
                  <Td className="font-mono text-xs">{s.sortOrder}</Td>
                  <Td className="font-mono text-sm">{s.soldierCount}</Td>
                  <Td>
                    <button onClick={() => handleDeleteSquad(s.id)}
                      className="text-xs text-rose-600 hover:text-rose-800">🗑️ מחק</button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
