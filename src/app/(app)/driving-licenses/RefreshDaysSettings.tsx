"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function RefreshDaysSettings({
  currentDays,
  action,
}: {
  currentDays: number;
  action: (formData: FormData) => Promise<void>;
}) {
  const [days, setDays] = useState(String(currentDays));
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSave() {
    const fd = new FormData();
    fd.set("days", days);
    startTransition(async () => {
      await action(fd);
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
      <h4 className="text-sm font-bold text-slate-700 mb-2">הגדרות ריענון נהיגה</h4>
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-600">תוקף ריענון (ימים):</label>
        <input
          type="number"
          min={1}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm w-24"
        />
        <button
          onClick={handleSave}
          disabled={pending || days === String(currentDays)}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
        >
          {pending ? "..." : "שמור"}
        </button>
      </div>
      <p className="text-xs text-slate-400 mt-1">
        חיילים שלא ביצעו ריענון תוך {currentDays} ימים יסומנו באזהרה
      </p>
    </div>
  );
}
