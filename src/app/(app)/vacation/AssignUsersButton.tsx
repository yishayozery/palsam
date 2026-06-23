"use client";

import { useState, useTransition, useMemo } from "react";
import { updateAssignees } from "./actions";

type UserOption = { id: string; fullName: string; title: string | null };

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

  const users = useMemo(() => {
    const seen = new Set<string>();
    const unique: UserOption[] = [];
    for (const u of allUsers) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      unique.push(u);
    }
    return unique.sort((a, b) => a.fullName.localeCompare(b.fullName, "he"));
  }, [allUsers]);

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.trim().toLowerCase();
    return users.filter((u) =>
      u.fullName.toLowerCase().includes(q) ||
      (u.title && u.title.toLowerCase().includes(q))
    );
  }, [users, search]);

  const toggle = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(users.map((u) => u.id)));
  const clearAll = () => setSelected(new Set());

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
          placeholder="🔍 חיפוש לפי שם או תפקיד..."
          className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
        />

        <div className="flex gap-3 mb-3 text-xs items-center">
          <button type="button" onClick={selectAll} className="text-blue-600 hover:underline font-medium">בחר הכל</button>
          <button type="button" onClick={clearAll} className="text-slate-500 hover:underline">נקה</button>
          <span className="text-slate-400 mr-auto">{selected.size} / {users.length} נבחרו</span>
        </div>

        <div className="overflow-y-auto flex-1 space-y-0.5">
          {filtered.map((u) => (
            <label
              key={u.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition ${selected.has(u.id) ? "bg-blue-50" : "hover:bg-slate-50"}`}
            >
              <input
                type="checkbox"
                checked={selected.has(u.id)}
                onChange={() => toggle(u.id)}
                className="rounded"
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{u.fullName}</span>
                {u.title && (
                  <span className="text-xs text-slate-500 mr-2">— {u.title}</span>
                )}
              </div>
            </label>
          ))}
          {filtered.length === 0 && (
            <div className="text-sm text-slate-400 text-center py-4">לא נמצאו משתמשים</div>
          )}
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
