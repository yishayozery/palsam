"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Badge, EmptyState, Table, Th, Td, LinkButton } from "@/components/ui";
import { saveEmployment, deleteEmployment } from "./actions";

type Employment = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  mode: string;
  _count: { allocations: number };
};

export default function EmploymentClient({
  employments,
  canManage,
}: {
  employments: Employment[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employment | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openCreate() {
    setEditingEmp(null);
    setShowForm(true);
    setError("");
  }

  function openEdit(emp: Employment) {
    setEditingEmp(emp);
    setShowForm(true);
    setError("");
  }

  function closeForm() {
    setShowForm(false);
    setEditingEmp(null);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const res = await saveEmployment(fd);
    setSaving(false);
    if (res.error) {
      setError(res.error);
    } else {
      closeForm();
      router.refresh();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("למחוק תעסוקה זו?")) return;
    const fd = new FormData();
    fd.set("id", id);
    const res = await deleteEmployment(fd);
    if (res.error) alert(res.error);
    else router.refresh();
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("he-IL");
  }

  function dayCount(start: string, end: string) {
    const s = new Date(start);
    const e = new Date(end);
    return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  }

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <LinkButton href="/attendance" variant="secondary">
          ← חזרה לנוכחות בתעסוקה
        </LinkButton>
        {canManage && (
          <Button type="button" onClick={showForm ? closeForm : openCreate}>
            {showForm ? "ביטול" : "➕ תעסוקה חדשה"}
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="p-4 md:p-6">
          <h3 className="font-bold text-lg mb-3">{editingEmp ? "עריכת תעסוקה" : "תעסוקה חדשה"}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {editingEmp && <input type="hidden" name="id" value={editingEmp.id} />}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">שם התעסוקה</label>
                <input
                  name="name"
                  required
                  defaultValue={editingEmp?.name ?? ""}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder='לדוג׳: "אימון מילואים מאי 2026"'
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">מצב חישוב</label>
                <select
                  name="mode"
                  defaultValue={editingEmp?.mode ?? "daily"}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="daily">יומי (הקצאה לפי יום)</option>
                  <option value="total">סה״כ (ימי מילואים כוללים)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">תאריך התחלה</label>
                <input
                  name="startDate"
                  type="date"
                  required
                  defaultValue={editingEmp?.startDate ?? ""}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">תאריך סיום</label>
                <input
                  name="endDate"
                  type="date"
                  required
                  defaultValue={editingEmp?.endDate ?? ""}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">סה״כ ימי מילואים</label>
                <input
                  name="totalDays"
                  type="number"
                  min={1}
                  required
                  defaultValue={editingEmp?.totalDays ?? ""}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" onClick={closeForm}>
                ביטול
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "שומר..." : editingEmp ? "שמור שינויים" : "צור תעסוקה"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {employments.length === 0 ? (
        <Card className="p-6">
          <EmptyState>אין תעסוקות פעילות. לחץ על ״תעסוקה חדשה״ ליצירת תעסוקה ראשונה.</EmptyState>
        </Card>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>שם</Th>
                <Th>תאריכים</Th>
                <Th>ימים</Th>
                <Th>סה״כ ימי מילואים</Th>
                <Th>מצב</Th>
                <Th>הקצאות</Th>
                {canManage && <Th>פעולות</Th>}
              </tr>
            </thead>
            <tbody>
              {employments.map((emp) => {
                const days = dayCount(emp.startDate, emp.endDate);
                const avg = emp.mode === "total" ? Math.ceil(emp.totalDays / days) : null;
                return (
                  <tr
                    key={emp.id}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => router.push(`/employment/${emp.id}`)}
                  >
                    <Td className="font-medium">{emp.name}</Td>
                    <Td>
                      {formatDate(emp.startDate)} - {formatDate(emp.endDate)}
                    </Td>
                    <Td>{days}</Td>
                    <Td>
                      {emp.totalDays}
                      {avg !== null && (
                        <span className="text-xs text-slate-400 mr-1">(~{avg}/יום)</span>
                      )}
                    </Td>
                    <Td>
                      <Badge
                        className={
                          emp.mode === "daily"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-purple-100 text-purple-700"
                        }
                      >
                        {emp.mode === "daily" ? "יומי" : "סה״כ"}
                      </Badge>
                    </Td>
                    <Td>{emp._count.allocations}</Td>
                    {canManage && (
                      <Td>
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(emp);
                            }}
                            className="text-blue-500 hover:text-blue-700 text-xs"
                          >
                            ערוך
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(emp.id);
                            }}
                            className="text-rose-500 hover:text-rose-700 text-xs"
                          >
                            מחק
                          </button>
                        </div>
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
