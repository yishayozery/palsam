"use client";

import { useState, useTransition } from "react";
import { updateAssignees } from "./actions";
import type { Role } from "@/generated/prisma";
import { ROLE_LABELS } from "@/lib/rbac";

type UserOption = { id: string; fullName: string; title: string | null; role: Role };

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

  const toggle = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
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
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-3">שיוך משתמשים ללוח</h3>
        <div className="mb-3 flex gap-2">
          <button type="button" onClick={() => setSelected(new Set(allUsers.map((u) => u.id)))} className="text-xs text-blue-600 hover:underline">בחר הכל</button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-slate-500 hover:underline">נקה</button>
        </div>
        <div className="space-y-1">
          {allUsers.map((u) => (
            <label key={u.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(u.id)}
                onChange={() => toggle(u.id)}
                className="rounded"
              />
              <span className="text-sm font-medium">{u.fullName}</span>
              <span className="text-xs text-slate-400">{u.title || ROLE_LABELS[u.role]}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2 mt-4">
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
