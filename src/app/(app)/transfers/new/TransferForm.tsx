"use client";

import { useRef, useState } from "react";
import { createIssue, createReturn } from "../actions";
import { Card } from "@/components/ui";
import BarcodeScanner from "@/components/BarcodeScanner";
import type { ScanHit } from "@/app/(app)/scan-actions";
import type { ScanMsg } from "@/lib/scan-feedback";

type Balance = {
  itemTypeId: string; statusId: string; name: string; unit: string; status: string; quantity: number;
};
type Serial = { id: string; name: string; serialNumber: string; status: string; lotQuantity: number | null };
type Ref = { id: string; name: string };

export default function TransferForm({
  isReturn,
  fromHolderId,
  balances,
  serialUnits,
  targets,
  statuses,
}: {
  isReturn: boolean;
  fromHolderId?: string;
  balances: Balance[];
  serialUnits: Serial[];
  targets: Ref[];
  statuses: Ref[];
}) {
  const action = isReturn ? createReturn : createIssue;
  const formRef = useRef<HTMLFormElement | null>(null);
  const [scanMsg, setScanMsg] = useState<ScanMsg | null>(null);

  /**
   * 📷 סריקה בטופס לא-מבוקר: מסמנים ישירות את השדה הקיים במקום לנהל
   * state מקביל — כך לא צריך לשכתב את הטופס, והשליחה נשארת form action.
   */
  function handleScan(hit: ScanHit) {
    if (hit.kind === "NOT_FOUND") return;
    const form = formRef.current;
    if (!form) return;

    if (hit.kind === "SERIAL") {
      const box = form.querySelector<HTMLInputElement>(`input[name="serial"][value="${hit.unitId}"]`);
      if (!box) {
        setScanMsg({ ok: false, text: `${hit.itemName} · ${hit.serialNumber} — לא זמין במקור${hit.holderName ? ` (נמצא ב${hit.holderName})` : ""}` });
        return;
      }
      if (box.checked) { setScanMsg({ ok: false, text: `${hit.itemName} · ${hit.serialNumber} — כבר מסומן` }); return; }
      box.checked = true;
      box.closest("label")?.scrollIntoView({ block: "center", behavior: "smooth" });
      setScanMsg({ ok: true, text: `${hit.itemName} · ${hit.serialNumber}` });
      return;
    }

    // כללי — מגדילים ב-1 את השדה עם היתרה הגדולה ביותר לפריט הזה
    const rows = balances.filter((b) => b.itemTypeId === hit.itemTypeId && b.quantity > 0);
    if (rows.length === 0) { setScanMsg({ ok: false, text: `${hit.itemName} — אין יתרה במקור` }); return; }
    const b = [...rows].sort((x, y) => y.quantity - x.quantity)[0];
    const input = form.querySelector<HTMLInputElement>(`input[name="qty:${b.itemTypeId}:${b.statusId}"]`);
    if (!input) { setScanMsg({ ok: false, text: `${hit.itemName} — לא נמצא שדה כמות` }); return; }
    const next = Math.min(b.quantity, (parseInt(input.value || "0", 10) || 0) + 1);
    input.value = String(next);
    input.scrollIntoView({ block: "center", behavior: "smooth" });
    setScanMsg({ ok: true, text: `${b.name} (${b.status}) — ${next}` });
  }

  return (
    <form ref={formRef} action={action} className="space-y-6">
      <Card className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <BarcodeScanner label="📷 סרוק פריט" onHit={handleScan} />
          {scanMsg ? (
            <span className={`flex-1 rounded-lg px-2 py-1.5 text-xs ${scanMsg.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
              {scanMsg.ok ? "✅ סומן:" : "⚠️"} {scanMsg.text}
            </span>
          ) : (
            <span className="text-[11px] text-slate-500">אפשר לסרוק ברקוד או לסמן ידנית מהרשימות למטה.</span>
          )}
        </div>
      </Card>
      {fromHolderId && <input type="hidden" name="fromHolderId" value={fromHolderId} />}
      <Card className="p-5">
        <div className="grid md:grid-cols-2 gap-4">
          {!isReturn && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">יעד</label>
              <select name="toHolderId" required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          {isReturn && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">סטטוס הציוד המוחזר</label>
              <select name="returnStatusId" required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">הערות</label>
            <input name="notes" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>
      </Card>

      {/* מלאי כמותי */}
      {balances.length > 0 && (
        <Card className="p-5">
          <h3 className="font-bold text-slate-700 mb-3">מלאי כמותי</h3>
          <div className="space-y-2">
            {balances.map((b) => (
              <div key={`${b.itemTypeId}:${b.statusId}`} className="flex items-center justify-between gap-3">
                <span className="text-sm">
                  {b.name} <span className="text-slate-400">({b.status}) · זמין: {b.quantity} {b.unit}</span>
                </span>
                <input
                  type="number" min="0" max={b.quantity} defaultValue="0"
                  name={`qty:${b.itemTypeId}:${b.statusId}`}
                  className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* יחידות סריאליות */}
      {serialUnits.length > 0 && (
        <Card className="p-5">
          <h3 className="font-bold text-slate-700 mb-3">פריטים פרטניים / אצווה</h3>
          <div className="grid md:grid-cols-2 gap-2">
            {serialUnits.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-100">
                <input type="checkbox" name="serial" value={s.id} className="w-4 h-4" />
                <span className="font-medium">{s.name}</span>
                <span className="font-mono text-xs text-slate-500">{s.serialNumber}</span>
                {s.lotQuantity && <span className="text-xs text-slate-400">×{s.lotQuantity}</span>}
                <span className="text-xs text-slate-400 mr-auto">{s.status}</span>
              </label>
            ))}
          </div>
        </Card>
      )}

      {balances.length === 0 && serialUnits.length === 0 && (
        <Card className="p-5">
          <p className="text-sm text-slate-400">אין מלאי זמין במקור.</p>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <button className="bg-slate-800 text-white rounded-lg px-6 py-2.5 text-sm font-medium hover:bg-slate-900">
          {isReturn ? "שליחת החזרה לאישור" : "יצירת הקצאה (מלאי במעבר)"}
        </button>
      </div>
    </form>
  );
}
