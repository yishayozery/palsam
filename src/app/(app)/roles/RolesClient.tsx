"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui";
import { saveSystemRole, deleteSystemRole } from "./actions";
import type { Screen } from "@/lib/rbac";
import { SCREEN_CATEGORIES, type ScreenCategory } from "@/lib/rbac";
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

const PERM_LABELS: Record<string, string> = { VIEW: "צפייה", EDIT: "עריכה" };
const PERM_DOT: Record<string, string> = {
  VIEW: "bg-blue-500",
  EDIT: "bg-emerald-500",
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

  function duplicateRole(role: RoleRow) {
    setEditingId("new");
    setName(role.name + " (עותק)");
    setIsCommander(role.isCommander);
    const p: Record<string, string> = {};
    for (const [k, v] of Object.entries(role.permissions)) p[k] = v;
    setPerms(p);
  }

  function copyPermsFrom(roleId: string) {
    const source = roles.find((r) => r.id === roleId);
    if (!source) return;
    const p: Record<string, string> = {};
    for (const [k, v] of Object.entries(source.permissions)) p[k] = v;
    setPerms(p);
    setIsCommander(source.isCommander);
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

  const permCount = (r: RoleRow) => Object.keys(r.permissions).length;
  const editCount = (r: RoleRow) => Object.values(r.permissions).filter((v) => v === "EDIT").length;
  const viewCount = (r: RoleRow) => Object.values(r.permissions).filter((v) => v === "VIEW").length;

  return (
    <div className="space-y-3 mt-4">
      <button
        onClick={startNew}
        className="bg-blue-700 hover:bg-blue-800 text-white rounded-lg px-5 py-2.5 text-sm font-bold shadow-md hover:shadow-lg transition"
      >
        + תפקיד חדש
      </button>

      {/* Compact role rows */}
      {roles.map((role) => {
        const isEditing = editingId === role.id;

        return (
          <Card key={role.id} className={`overflow-hidden ${isEditing ? "ring-2 ring-blue-400" : ""}`}>
            {/* Compact header row — always visible */}
            <div
              className={`p-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50 transition ${isEditing ? "bg-blue-50 border-b border-blue-200" : ""}`}
              onClick={() => isEditing ? cancelEdit() : startEdit(role)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm">{role.name}</span>
                  {role.isPreset && <Badge className="bg-slate-100 text-slate-500 text-[10px]">מובנה</Badge>}
                  {role.isAdmin && <Badge className="bg-purple-100 text-purple-700 text-[10px]">מנהל</Badge>}
                  {role.isCommander && <Badge className="bg-amber-100 text-amber-700 text-[10px]">פיקודי</Badge>}
                </div>
                {/* Mini permission dots grouped by category */}
                {!role.isAdmin && (
                  <div className="flex items-center gap-0.5 mt-1">
                    {(Object.keys(SCREEN_CATEGORIES) as ScreenCategory[]).map((cat, ci) => (
                      <div key={cat} className="flex items-center gap-0.5">
                        {ci > 0 && <div className="w-px h-2 bg-slate-300 mx-0.5" />}
                        {SCREEN_CATEGORIES[cat].screens.filter((s) => screenKeys.includes(s)).map((screen) => {
                          const level = role.permissions[screen];
                          return (
                            <div
                              key={screen}
                              title={`${screens[screen]}: ${level ? PERM_LABELS[level] : "אין גישה"}`}
                              className={`w-2 h-2 rounded-full ${level ? PERM_DOT[level] : "bg-slate-200"}`}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="text-[11px] text-slate-500 text-left shrink-0">
                {role.isAdmin ? (
                  <span>כל המסכים</span>
                ) : (
                  <span>{permCount(role)}/{screenKeys.length} מסכים ({editCount(role)} עריכה, {viewCount(role)} צפייה)</span>
                )}
              </div>

              <Badge className="bg-blue-50 text-blue-700 text-[10px] shrink-0">{role.userCount} משתמשים</Badge>

              {!isEditing && (
                <button
                  onClick={(e) => { e.stopPropagation(); duplicateRole(role); }}
                  className="text-[10px] text-slate-400 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-blue-50 shrink-0"
                  title="שכפל תפקיד"
                >
                  📋
                </button>
              )}

              <span className="text-slate-400 text-xs shrink-0">{isEditing ? "▲" : "▼"}</span>
            </div>

            {/* Expanded edit form */}
            {isEditing && (
              <div className="p-4 space-y-4 bg-white">
                <div className="flex items-center gap-4">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="שם התפקיד"
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                    autoFocus
                  />
                  <div className="shrink-0">
                    <label className="flex items-center gap-2 text-sm whitespace-nowrap cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isCommander}
                        onChange={(e) => setIsCommander(e.target.checked)}
                      />
                      רואה רק את הפלוגה שלו
                    </label>
                    <div className="text-[10px] text-slate-400 mr-6">הדלק למפ&quot;ם, מפלג, שליש. כבה לקשר&quot;ג, ק.רכב</div>
                  </div>
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

                  <ScreenGrid screens={screens} perms={perms} cyclePerm={cyclePerm} />
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                  <div>
                    {role.userCount === 0 ? (
                      <button
                        onClick={() => handleDelete(role.id)}
                        className="px-3 py-1.5 text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg"
                      >
                        🗑️ מחיקה
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400">{role.userCount} משתמשים משויכים — לא ניתן למחוק</span>
                    )}
                  </div>
                  <div className="flex gap-2">
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
              </div>
            )}
          </Card>
        );
      })}

      {/* New role form */}
      {editingId === "new" && (
        <Card className="overflow-hidden ring-2 ring-blue-400">
          <div className="bg-blue-50 p-3 border-b border-blue-200">
            <span className="font-bold text-sm">תפקיד חדש</span>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="שם התפקיד"
                className="flex-1 px-3 py-2 border rounded-lg text-sm min-w-[160px]"
                autoFocus
              />
              <div className="shrink-0">
                <label className="flex items-center gap-2 text-sm whitespace-nowrap cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isCommander}
                    onChange={(e) => setIsCommander(e.target.checked)}
                  />
                  רואה רק את הפלוגה שלו
                </label>
                <div className="text-[10px] text-slate-400 mr-6">הדלק למפ&quot;ם, מפלג, שליש. כבה לקשר&quot;ג, ק.רכב</div>
              </div>
            </div>

            {/* Copy from existing role */}
            {roles.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">העתק הרשאות מתפקיד:</span>
                <select
                  onChange={(e) => { if (e.target.value) copyPermsFrom(e.target.value); e.target.value = ""; }}
                  className="border rounded-lg px-2 py-1 text-xs text-slate-600"
                  defaultValue=""
                >
                  <option value="" disabled>בחר תפקיד...</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">הרשאות מסכים:</span>
                <div className="flex gap-1.5">
                  <button onClick={() => setAllPerms("VIEW")} className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">הכל צפייה</button>
                  <button onClick={() => setAllPerms("EDIT")} className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200">הכל עריכה</button>
                  <button onClick={() => setAllPerms("")} className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200">נקה הכל</button>
                </div>
              </div>
              <ScreenGrid screens={screens} perms={perms} cyclePerm={cyclePerm} />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button onClick={cancelEdit} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">ביטול</button>
              <button onClick={handleSave} disabled={!name.trim() || isPending}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {isPending ? "שומר..." : "שמירה"}
              </button>
            </div>
          </div>
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

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-2 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> עריכה</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> צפייה</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-200 inline-block" /> אין גישה</span>
        <span className="text-slate-300">|</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded border border-amber-400 bg-amber-50 inline-block" /> מחסן</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded border border-blue-400 bg-blue-50 inline-block" /> פלוגה</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded border border-slate-400 bg-slate-50 inline-block" /> כללי</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded border border-purple-400 bg-purple-50 inline-block" /> ניהול</span>
      </div>
    </div>
  );
}

const CAT_STYLES: Record<string, { border: string; bg: string; text: string; headerBg: string }> = {
  warehouse: { border: "border-amber-300", bg: "bg-amber-50/40", text: "text-amber-800", headerBg: "bg-amber-100" },
  company: { border: "border-blue-300", bg: "bg-blue-50/40", text: "text-blue-800", headerBg: "bg-blue-100" },
  general: { border: "border-slate-300", bg: "bg-slate-50/40", text: "text-slate-700", headerBg: "bg-slate-100" },
  admin: { border: "border-purple-300", bg: "bg-purple-50/40", text: "text-purple-800", headerBg: "bg-purple-100" },
};

function ScreenGrid({ screens, perms, cyclePerm }: {
  screens: Record<Screen, string>;
  perms: Record<string, string>;
  cyclePerm: (screen: string) => void;
}) {
  return (
    <div className="space-y-3">
      {(Object.keys(SCREEN_CATEGORIES) as ScreenCategory[]).map((cat) => {
        const catDef = SCREEN_CATEGORIES[cat];
        const catScreens = catDef.screens.filter((s) => s in screens);
        if (catScreens.length === 0) return null;
        const style = CAT_STYLES[cat];
        return (
          <div key={cat} className={`rounded-xl border-2 ${style.border} overflow-hidden`}>
            <div className={`px-3 py-1.5 ${style.headerBg} flex items-center gap-1.5`}>
              <span className="text-sm">{catDef.icon}</span>
              <span className={`text-xs font-bold ${style.text}`}>{catDef.label}</span>
              <span className="text-[10px] text-slate-400 mr-auto">
                {catScreens.filter((s) => perms[s]).length}/{catScreens.length}
              </span>
            </div>
            <div className={`p-2 ${style.bg}`}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                {catScreens.map((screen) => {
                  const level = perms[screen] || "";
                  return (
                    <button
                      key={screen}
                      onClick={() => cyclePerm(screen)}
                      className={`px-2.5 py-2 rounded-lg text-xs text-right border transition ${
                        level === "EDIT" ? "bg-green-50 border-green-300 text-green-800"
                        : level === "VIEW" ? "bg-blue-50 border-blue-300 text-blue-800"
                        : "bg-white border-slate-200 text-slate-400"
                      }`}
                    >
                      <div className="font-medium">{screens[screen]}</div>
                      <div className="text-[10px] mt-0.5">{level ? PERM_LABELS[level] : "—"}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-slate-400">לחיצה: ללא → צפייה → עריכה → ללא</p>
    </div>
  );
}
