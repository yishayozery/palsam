"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveVacationStatus } from "../actions";

type Status = { id: string; name: string; color: string; icon: string | null };

const PRESET_COLORS = ["#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#06b6d4", "#ec4899"];
const PRESET_ICONS = ["✅", "🏖️", "🏥", "📚", "🔒", "🛫", "🏠", "⚡", "🎖️", "🔄"];

export default function StatusManager({ statuses }: { statuses: Status[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [icon, setIcon] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const handleAdd = () => {
    if (!name.trim()) return;
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("color", color);
    fd.set("icon", icon);
    startTransition(async () => {
      await saveVacationStatus(fd);
      setName("");
      setIcon("");
      router.refresh();
    });
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-blue-600 hover:underline">
        + הוסף סטטוס
      </button>
    );
  }

  return (
    <div className="bg-white border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-sm">ניהול סטטוסים</h4>
        <button onClick={() => setOpen(false)} className="text-slate-400 text-sm">✕</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {statuses.map((s) => (
          <div key={s.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs" style={{ borderColor: s.color + "60" }}>
            <div className="w-3 h-3 rounded" style={{ backgroundColor: s.color }} />
            {s.icon} {s.name}
          </div>
        ))}
      </div>
      <div className="flex gap-2 items-end">
        <div>
          <label className="text-[10px] text-slate-500 block">שם</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="border rounded px-2 py-1.5 text-sm w-32" placeholder="למשל: מחלה" />
        </div>
        <div>
          <label className="text-[10px] text-slate-500 block">צבע</label>
          <div className="flex gap-1">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded ${color === c ? "ring-2 ring-offset-1 ring-blue-500" : ""}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] text-slate-500 block">אייקון</label>
          <div className="flex gap-1 flex-wrap max-w-[160px]">
            {PRESET_ICONS.map((ic) => (
              <button
                key={ic}
                onClick={() => setIcon(ic)}
                className={`w-6 h-6 text-sm rounded ${icon === ic ? "ring-2 ring-blue-500 bg-blue-50" : "hover:bg-slate-100"}`}
              >
                {ic}
              </button>
            ))}
          </div>
        </div>
        <button onClick={handleAdd} disabled={pending || !name.trim()} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50">
          {pending ? "..." : "הוסף"}
        </button>
      </div>
    </div>
  );
}
