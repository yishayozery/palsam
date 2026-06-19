"use client";

import { useState } from "react";
import { removeTransferLineByToken, updateTransferLineQtyByToken } from "@/app/(app)/signatures/actions";
import { useRouter } from "next/navigation";

type Line = {
  id: string;
  itemName: string;
  serialNumber: string | null;
  lotQuantity: number | null;
  quantity: number;
  isSerial: boolean;
};

export default function EditableItemList({ token, lines }: { token: string; lines: Line[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleRemove = async (lineId: string) => {
    if (!confirm("להסיר פריט זה מההחתמה?")) return;
    setBusy(lineId);
    setError("");
    const res = await removeTransferLineByToken(token, lineId);
    setBusy(null);
    if (res.error) setError(res.error);
    else router.refresh();
  };

  const handleQtyChange = async (lineId: string, newQty: number) => {
    if (newQty < 1) return;
    setBusy(lineId);
    setError("");
    const res = await updateTransferLineQtyByToken(token, lineId, newQty);
    setBusy(null);
    if (res.error) setError(res.error);
    else router.refresh();
  };

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-700 mb-2">📋 פירוט הציוד להחתמה:</h2>
      {error && <p className="text-xs text-rose-600 mb-2">⚠️ {error}</p>}
      <div className="space-y-1.5 mb-5">
        {lines.map((l) => (
          <div key={l.id} className={`bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-200 ${busy === l.id ? "opacity-50" : ""}`}>
            <div className="flex justify-between items-start gap-2">
              <span className="font-bold text-sm text-slate-800 flex-1 min-w-0">{l.itemName}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {!l.isSerial && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleQtyChange(l.id, l.quantity - 1)}
                      disabled={busy === l.id || l.quantity <= 1}
                      className="w-6 h-6 rounded border border-slate-300 text-xs font-bold hover:bg-slate-100 disabled:opacity-30"
                    >−</button>
                    <span className="font-mono text-xs bg-blue-100 text-blue-800 rounded px-1.5 py-0.5 min-w-[2rem] text-center">
                      ×{l.quantity}
                    </span>
                    <button
                      onClick={() => handleQtyChange(l.id, l.quantity + 1)}
                      disabled={busy === l.id}
                      className="w-6 h-6 rounded border border-slate-300 text-xs font-bold hover:bg-slate-100 disabled:opacity-30"
                    >+</button>
                  </div>
                )}
                {l.isSerial && l.lotQuantity && l.lotQuantity > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleQtyChange(l.id, l.quantity - 1)}
                      disabled={busy === l.id || l.quantity <= 1}
                      className="w-6 h-6 rounded border border-slate-300 text-xs font-bold hover:bg-slate-100 disabled:opacity-30"
                    >−</button>
                    <span className="font-mono text-xs bg-blue-100 text-blue-800 rounded px-1.5 py-0.5 min-w-[2rem] text-center">
                      ×{l.quantity}
                    </span>
                    <button
                      onClick={() => handleQtyChange(l.id, l.quantity + 1)}
                      disabled={busy === l.id || l.quantity >= l.lotQuantity}
                      className="w-6 h-6 rounded border border-slate-300 text-xs font-bold hover:bg-slate-100 disabled:opacity-30"
                    >+</button>
                  </div>
                )}
                <button
                  onClick={() => handleRemove(l.id)}
                  disabled={busy === l.id}
                  className="text-rose-400 hover:text-rose-700 text-lg px-1 disabled:opacity-30"
                  title="הסר פריט"
                >✕</button>
              </div>
            </div>
            {l.serialNumber && (
              <div className="text-xs font-mono text-indigo-700 mt-0.5 bg-indigo-50 rounded px-2 py-0.5 inline-block">
                SN: {l.serialNumber}
                {l.isSerial && l.lotQuantity && l.lotQuantity > 1 && (
                  <span className="text-slate-500 mr-1">× {l.lotQuantity}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
