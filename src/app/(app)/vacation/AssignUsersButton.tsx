"use client";

import { useState, useTransition, useMemo } from "react";
import { updateAssignees } from "./actions";
import type { Role } from "@/generated/prisma";
import { ROLE_LABELS } from "@/lib/rbac";

type UserOption = { id: string; fullName: string; title: string | null; role: Role };

const ROLE_ORDER: Role[] = ["BATTALION_ADMIN", "WAREHOUSE_MANAGER", "COMPANY_REP", "SHALISH", "MAGAD", "SAMAGAD", "VIEWER"];

export default function AssignUsersButton({
  boardId,
  allUsers,
  currentAssignees,
}: {
  boardId: string;
  allUsers: UserOption[];
  currentAssignees: string[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(currentAssignees));
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");

  // deduplicate by id and group by role
  const grouped = useMemo(() => {
    const seen = new Set<string>();
    const unique: UserOption[] = [];
    for (const u of allUsers) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      unique.push(u);
    }
    const groups: { role: Role; label: string; users: UserOption[] }[] = [];
    for (const role of ROLE_ORDER) {
      const users = unique.filter((u) => u.role === role);
      if (users.length > 0) {
        groups.push({ role, label: ROLE_LABELS[role], users });
      }
    }
    return groups;
  }, [allUsers]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.trim().toLowerCase();
    return grouped
      .map((g) => ({
        ...g,
        users: g.users.filter((u) =>
          u.fullName.toLowerCase().includes(q) ||
          (u.title && u.title.toLowerCase().includes(q))
        ),
      }))
      .filter((g) => g.users.length > 0);
  }, [grouped, search]);

  const toggle = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const toggleRole = (role: Role) => {
    const group = grouped.find((g) => g.role === role);
    if (!group) return;
    const allSelected = group.users.every((u) => selected.has(u.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const u of group.users) {
        if (allSelected) next.delete(u.id);
        else next.add(u.id);
      }
      return next;
    });
  };

  const handleSave = () => {
    const fd = new FormData();
    fd.set("boardId", boardId);
    selected.forEach((uid) => fd.append("userId", uid));
    startTransition(async () => {
      await updateAssignees(fd);
      setOpen(false);
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 bg-slate-100 rounded-lg text-sm hover:bg-slate-200"
      >
        👥 שיוך
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-3">שיוך משתמשים ללוח</h3>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 חיפוש לפי שם..."
          className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
        />

        <div className="flex gap-2 mb-3 text-xs">
          <button type="button" onClick={() => setSelected(new Set(allUsers.map((u) => u.id)))} className="text-blue-600 hover:underline">בחר הכל</button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-slate-500 hover:underline">נקה</button>
          <span className="text-slate-400 mr-auto">{selected.size} נבחרו</span>
        </div>

        <div className="overflow-y-auto flex-1 space-y-3">
          {filteredGroups.map((g) => {
            const allGroupSelected = g.users.every((u) => selected.has(u.id));
            return (
              <div key={g.role}>
                <div
                  className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100"
                  onClick={() => toggleRole(g.role)}
                >
                  <input type="checkbox" checked={allGroupSelected} readOnly className="rounded" />
                  <span className="text-xs font-bold text-slate-600">{g.label}</span>
                  <span className="text-[10px] text-slate-400">({g.users.length})</span>
                </div>
                <div className="mr-4 space-y-0.5 mt-1">
                  {g.users.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.has(u.id)}
                        onChange={() => toggle(u.id)}
                        className="rounded"
                      />
                      <span className="text-sm">{u.fullName}</span>
                      {u.title && <span className="text-[10px] text-slate-400">({u.title})</span>}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 mt-4 pt-3 border-t">
          <button
            onClick={handleSave}
            disabled={pending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "שומר..." : `שמור (${selected.size})`}
          </button>
          <button onClick={() => setOpen(false)} className="px-4 py-2 bg-slate-200 rounded-lg text-sm">ביטול</button>
        </div>
      </div>
    </div>
  );
}
