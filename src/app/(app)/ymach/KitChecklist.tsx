"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { saveKitChecklist } from "./kit-template-actions";
import type { KitTemplateData } from "./KitTemplatesTab";

type KitItem = {
  itemTypeId: string; itemName: string; sku: string | null; quantity: number;
  present: boolean; presentQuantity: number;
  serialNumber: string | null; lotNumber: string | null; expiryDate: string | null;
};

/**
 * צ'קליסט הקמת ארגז מול תבנית — מציג את רשימת התבנית, ולכל פריט:
 * יש/אין, כמה נמצאו, ושדות סריאלי/אצווה/תוקף לפי דגלי שורת התבנית.
 */
export default function KitChecklist({
  kitId, items, template, onClose,
}: {
  kitId: string;
  items: KitItem[];
  template: KitTemplateData | undefined;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const reqFor = (itemTypeId: string) => template?.lines.find((l) => l.itemTypeId === itemTypeId);

  const [rows, setRows] = useState(() =>
    items.map((i) => ({
      itemTypeId: i.itemTypeId,
      present: i.present,
      presentQuantity: i.presentQuantity || 0,
      serialNumber: i.serialNumber ?? "",
      lotNumber: i.lotNumber ?? "",
      expiryDate: i.expiryDate ?? "",
    })),
  );

  const upd = (id: string, patch: Partial<(typeof rows)[number]>) =>
    setRows((rs) => rs.map((r) => (r.itemTypeId === id ? { ...r, ...patch } : r)));

  // סימון "יש" ברירת-מחדל ממלא את הכמות הנדרשת
  const togglePresent = (item: KitItem, present: boolean) =>
    upd(item.itemTypeId, { present, presentQuantity: present ? (rows.find((r) => r.itemTypeId === item.itemTypeId)?.presentQuantity || item.quantity) : 0 });

  function save() {
    setError(null);
    start(async () => {
      const res = await saveKitChecklist(kitId, rows.map((r) => ({
        itemTypeId: r.itemTypeId, present: r.present, presentQuantity: r.presentQuantity,
        serialNumber: r.serialNumber, lotNumber: r.lotNumber, expiryDate: r.expiryDate,
      })));
      if (res?.error) { setError(res.error); return; }
      onClose();
      router.refresh();
    });
  }

  const okCount = rows.filter((r) => r.present && r.presentQuantity >= (items.find((i) => i.itemTypeId === r.itemTypeId)?.quantity ?? 1)).length;

  return (
    <div className="mt-2 p-3 bg-indigo-50 rounded-lg border border-indigo-200">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold text-indigo-800">צ&apos;קליסט תכולה מול התבנית</h4>
        <span className="text-xs text-slate-500">{okCount}/{items.length} תקינים</span>
      </div>

      <div className="space-y-1.5">
        {items.map((item) => {
          const r = rows.find((x) => x.itemTypeId === item.itemTypeId)!;
          const req = reqFor(item.itemTypeId);
          const short = r.present && r.presentQuantity < item.quantity;
          return (
            <div key={item.itemTypeId} className={`rounded-lg border p-2 text-xs ${!r.present ? "bg-rose-50 border-rose-200" : short ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-1 font-semibold">
                  <input type="checkbox" checked={r.present} onChange={(e) => togglePresent(item, e.target.checked)} />
                  {item.itemName}
                </label>
                <span className="text-slate-400">נדרש {item.quantity}</span>
                {r.present && (
                  <label className="flex items-center gap-1 mr-auto">
                    נמצאו
                    <input type="number" min={0} max={item.quantity} value={r.presentQuantity}
                      onChange={(e) => upd(item.itemTypeId, { presentQuantity: Math.max(0, +e.target.value || 0) })}
                      className="w-14 rounded border px-1.5 py-0.5" />
                  </label>
                )}
                {!r.present && <span className="mr-auto text-rose-600 font-bold">חסר</span>}
              </div>

              {r.present && req && (req.requiresSerial || req.requiresLot || req.requiresExpiry) && (
                <div className="flex gap-2 flex-wrap mt-1.5 pr-5">
                  {req.requiresSerial && (
                    <input value={r.serialNumber} onChange={(e) => upd(item.itemTypeId, { serialNumber: e.target.value })}
                      placeholder="מס' סריאלי" className="rounded border px-2 py-0.5 w-32" />
                  )}
                  {req.requiresLot && (
                    <input value={r.lotNumber} onChange={(e) => upd(item.itemTypeId, { lotNumber: e.target.value })}
                      placeholder="מס' אצווה" className="rounded border px-2 py-0.5 w-28" />
                  )}
                  {req.requiresExpiry && (
                    <label className="flex items-center gap-1">תוקף
                      <input type="date" value={r.expiryDate} onChange={(e) => upd(item.itemTypeId, { expiryDate: e.target.value })}
                        className="rounded border px-2 py-0.5" />
                    </label>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <div className="text-xs text-rose-600 mt-2">{error}</div>}
      <div className="flex gap-2 justify-end mt-2">
        <button onClick={onClose} className="text-xs text-slate-500">סגור</button>
        <Button onClick={save} disabled={pending}>{pending ? "שומר…" : "✓ שמור צ'קליסט"}</Button>
      </div>
    </div>
  );
}
