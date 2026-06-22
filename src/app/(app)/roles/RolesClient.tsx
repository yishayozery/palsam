"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui";
import { saveSystemRole, deleteSystemRole } from "./actions";
import type { Screen } from "@/lib/rbac";
import type { PermissionLevel } from "@/generated/prisma";

type RoleRow = {
  id: string;
  name: string;
  isPreset: boolean;
  isAdmin: boolean;
  isCommander: boolean;
  userCount: number;
  permissions: Record<string, PermissionLevel>;
};

export default function RolesClient({
  roles,
  screens,
  screenKeys,
}: {
  roles: RoleRow[];
  screens: Record<Screen, string>;
  screenKeys: Screen[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [isCommander, setIsCommander] = useState(false);
  const [perms, setPerms] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function startEdit(role: RoleRow) {
    setEditingId(role.id);
    setName(role.name);
    setIsCommander(role.isCommander);
    const p: Record<string, string> = {};
    for (const [k, v] of Object.entries(role.permissions)) p[k] = v;
    setPerms(p);
  }

  function startNew() {
    setEditingId("new");
    setName("");
    setIsCommander(false);
    setPerms({});
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function cyclePerm(screen: string) {
    setPerms((prev) => {
      const cur = prev[screen] || "";
      const next = cur === "" ? "VIEW" : cur === "VIEW" ? "EDIT" : "";
      const copy = { ...prev };
      if (next) copy[screen] = next;
      else delete copy[screen];
      return copy;
    });
  }

  function setAllPerms(level: "VIEW" | "EDIT" | "") {
    if (level === "") {
      setPerms({});
    } else {
      const p: Record<string, string> = {};
      for (const k of screenKeys) p[k] = level;
      setPerms(p);
    }
  }

  function handleSave() {
    const fd = new FormData();
    if (editingId !== "new") fd.set("id", editingId!);
    fd.set("name", name);
    fd.set("isCommander", String(isCommander));
    for (const screen of screenKeys) {
      if (perms[screen]) fd.set(`perm_${screen}`, perms[screen]);
    }
    startTransition(async () => {
      await saveSystemRole(fd);
      setEditingId(null);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    if (!confirm("למחוק תפקיד זה?")) return;
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      await deleteSystemRole(fd);
      router.refresh();
    });
  }

  const PERM_COLORS: Record<string, string> = {
    VIEW: "bg-blue-100 text-blue-700",
    EDIT: "bg-green-100 text-green-700",
  };
  const PERM_LABELS: Record<string, string> = {
    VIEW: "צפייה",
    EDIT: "עריכה",
  };

  return (
    <div className="space-y-4">
      {/* Roles list */}
      {roles.map((role) => (
        <Card key={role.id} className="p-4">
          {editingId === role.id ? (
            <EditForm />
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg">{role.name}</span>
                  {role.isPreset && <Badge className="bg-slate-100 text-slate-600">מובנה</Badge>}
                  {role.isAdmin && <Badge className="bg-purple-100 text-purple-700">מנהל</Badge>}
                  {role.isCommander && <Badge className="bg-amber-100 text-amber-700">פיקודי</Badge>}
                  <Badge className="bg-blue-100 text-blue-700">{role.userCount} משתמשים</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startEdit(role)}
                    className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    עריכה
                  </button>
                  {!role.isPreset && role.userCount === 0 && (
                    <button
                      onClick={() => handleDelete(role.id)}
                      className="px-3 py-1.5 text-sm bg-rose-100 text-rose-700 hover:bg-rose-200 rounded-lg"
                    >
                      מחיקה
                    </button>
                  )}
                </div>
              </div>
              {!role.isAdmin && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {screenKeys.map((screen) => {
                    const level = role.permissions[screen];
                    if (!level) return null;
                    return (
                      <span key={screen} className={`text-xs px-2 py-0.5 rounded-full ${PERM_COLORS[level]}`}>
                        {screens[screen]} — {PERM_LABELS[level]}
                      </span>
                    );
                  })}
                </div>
              )}
              {role.isAdmin && (
                <p className="text-sm text-slate-500 mt-1">גישה מלאה לכל המסכים</p>
              )}
            </div>
          )}
        </Card>
      ))}

      {/* New / Edit Form */}
      {editingId === "new" && (
        <Card className="p-4 border-blue-300 bg-blue-50/30">
          <EditForm />
        </Card>
      )}

      {!editingId && (
        <button
          onClick={startNew}
          className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-blue-400 hover:text-blue-600 transition"
        >
          + תפקיד חדש
        </button>
      )}
    </div>
  );

  function EditForm() {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="שם התפקיד"
            className="flex-1 px-3 py-2 border rounded-lg text-sm"
            autoFocus
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isCommander}
              onChange={(e) => setIsCommander(e.target.checked)}
            />
            תפקיד פיקודי
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">הרשאות מסכים:</span>
            <div className="flex gap-1.5">
              <button onClick={() => setAllPerms("VIEW")} className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
                הכל צפייה
              </button>
              <button onClick={() => setAllPerms("EDIT")} className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200">
                הכל עריכה
              </button>
              <button onClick={() => setAllPerms("")} className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200">
                נקה הכל
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
            {screenKeys.map((screen) => {
              const level = perms[screen] || "";
              return (
                <button
                  key={screen}
                  onClick={() => cyclePerm(screen)}
                  className={`px-2.5 py-2 rounded-lg text-xs text-right border transition ${
                    level === "EDIT"
                      ? "bg-green-50 border-green-300 text-green-800"
                      : level === "VIEW"
                        ? "bg-blue-50 border-blue-300 text-blue-800"
                        : "bg-white border-slate-200 text-slate-400"
                  }`}
                >
                  <div className="font-medium">{screens[screen]}</div>
                  <div className="text-[10px] mt-0.5">
                    {level ? PERM_LABELS[level] : "—"}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">לחיצה: ללא → צפייה → עריכה → ללא</p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={cancelEdit}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
          >
            ביטול
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || isPending}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? "שומר..." : "שמירה"}
          </button>
        </div>
      </div>
    );
  }
}
