"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import { createDraftFromText } from "./actions";

export default function NewIntakeForm({ warehouses }: { warehouses: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [holderId, setHolderId] = useState(warehouses[0]?.id ?? "");

  function submit(formData: FormData) {
    setError(null);
    formData.set("holderId", holderId);
    start(async () => {
      const res = await createDraftFromText(formData);
      if (res?.error) { setError(res.error); return; }
      if (res?.ok) router.push(`/stock/intake/${res.id}`);
    });
  }

  return (
    <Card className="p-4">
      <form action={submit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-slate-500">מחסן יעד</span>
            <select
              value={holderId}
              onChange={(e) => setHolderId(e.target.value)}
              className="w-full mt-1 rounded-lg border border-slate-300 px-3 py-2 text-base"
            >
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">מספר שובר / כלי (רשות)</span>
            <input name="voucherNo" className="w-full mt-1 rounded-lg border border-slate-300 px-3 py-2 text-base" placeholder="30866833" />
          </label>
        </div>
        <label className="block">
          <span className="text-xs text-slate-500">שורות השובר — הדבקה או הקלדה</span>
          <textarea
            name="text"
            rows={6}
            required
            dir="rtl"
            className="w-full mt-1 rounded-lg border border-slate-300 px-3 py-2 text-base font-mono"
            placeholder={"408132924 מעיל סערה זית 0 71 -71\n113516500 מחסנית מתכת 30 כדור 2 283 -281"}
          />
        </label>
        {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">{error}</div>}
        <Button type="submit" disabled={pending || !holderId}>{pending ? "מעבד…" : "צור טיוטה"}</Button>
      </form>
    </Card>
  );
}
