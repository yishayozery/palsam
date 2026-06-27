"use client";

import { useState } from "react";

type SignedSerial = {
  id: string; itemName: string; sku: string | null;
  serialNumber: string; lotQuantity: number | null;
  statusName: string; isWear: boolean; isLoss: boolean;
  signedAt: string | null; // ISO
  signedBy: string | null;
  currentHolderName: string | null;
};
type SignedQty = {
  itemTypeId: string; itemName: string; sku: string | null; unit: string;
  statusName: string;
  quantity: number;
  lastSignedAt: string | null;
  lastSignedBy: string | null;
};
type IssuedKit = {
  kitName: string; kitNumber: string | null;
  items: { name: string; sku: string | null; qty: number }[];
};

export default function SoldierEquipmentButton({
  soldierId, soldierName, signedSerials, signedQty, issuedKits,
}: {
  soldierId: string;
  soldierName: string;
  signedSerials: SignedSerial[];
  signedQty: SignedQty[];
  issuedKits: IssuedKit[];
}) {
  const [open, setOpen] = useState(false);
  const total = signedSerials.length + signedQty.length + issuedKits.length;
  if (total === 0) {
    return <span className="text-[10px] text-slate-400">לא חתום על ציוד</span>;
  }
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="text-[11px] bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded px-2 py-0.5">
        🪖 ציוד חתום ({total})
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white p-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-lg">🪖 ציוד חתום — {soldierName}</h3>
                <p className="text-xs text-blue-100 mt-0.5">סה״כ {total} פריטים — עם תאריך החתימה ומי חתם</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-blue-100 hover:text-white text-2xl">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {issuedKits.length > 0 && (
                <div>
                  <h4 className="font-bold text-sm text-slate-700 mb-2">🎒 ארגזים מבצעיים ({issuedKits.length})</h4>
                  <div className="space-y-2">
                    {issuedKits.map((kit, idx) => (
                      <div key={idx} className="border border-emerald-300 bg-emerald-50 rounded-lg p-2.5">
                        <div className="font-medium text-sm">
                          🎒 {kit.kitName}
                          {kit.kitNumber && <span className="text-xs text-emerald-600 font-mono mr-2">#{kit.kitNumber}</span>}
                        </div>
                        {kit.items.length > 0 && (
                          <div className="mt-1.5 mr-3 space-y-0.5">
                            {kit.items.map((item, j) => (
                              <div key={j} className="text-[11px] text-slate-600 flex gap-2">
                                <span className="flex-1">{item.name}{item.sku && <span className="font-mono text-slate-400 mr-1">({item.sku})</span>}</span>
                                <span className="text-emerald-700 font-medium">×{item.qty}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {signedSerials.length > 0 && (
                <div>
                  <h4 className="font-bold text-sm text-slate-700 mb-2">🔫 סריאלי / אצוות ({signedSerials.length})</h4>
                  <div className="space-y-1.5">
                    {signedSerials.map((u) => (
                      <div key={u.id} className={`border rounded-lg p-2.5 ${u.isLoss ? "border-rose-300 bg-rose-50" : u.isWear ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">
                              {u.itemName}
                              {u.sku && <span className="font-mono text-xs text-slate-400 mr-2">{u.sku}</span>}
                              {u.lotQuantity && u.lotQuantity > 1 && <span className="text-[10px] bg-orange-100 text-orange-800 rounded px-1.5 py-0.5 mr-1">אצווה ×{u.lotQuantity}</span>}
                            </div>
                            <div className="text-xs text-slate-500 font-mono mt-0.5">
                              {u.lotQuantity && u.lotQuantity > 1 ? `לוט: ${u.serialNumber}` : `SN: ${u.serialNumber}`}
                              {" · "}{u.statusName}
                              {u.isLoss && " 🔴"}{u.isWear && " 🟡"}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-1 flex gap-3 flex-wrap">
                              {u.signedAt && <span>📅 נחתם: <b>{new Date(u.signedAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })}</b></span>}
                              {u.signedBy && <span>👤 חתם: <b>{u.signedBy}</b></span>}
                              {u.currentHolderName && <span>📍 מ-{u.currentHolderName}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {signedQty.length > 0 && (
                <div>
                  <h4 className="font-bold text-sm text-slate-700 mb-2">📦 כמותי ({signedQty.length})</h4>
                  <div className="space-y-1.5">
                    {signedQty.map((q) => (
                      <div key={`${q.itemTypeId}-${q.statusName}`} className="border border-slate-200 bg-white rounded-lg p-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">
                              {q.itemName}
                              {q.sku && <span className="font-mono text-xs text-slate-400 mr-2">{q.sku}</span>}
                              <span className="text-[11px] bg-blue-100 text-blue-800 rounded px-1.5 py-0.5 mr-1">×{q.quantity} {q.unit}</span>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">{q.statusName}</div>
                            <div className="text-[11px] text-slate-500 mt-1 flex gap-3 flex-wrap">
                              {q.lastSignedAt && <span>📅 נחתם לאחרונה: <b>{new Date(q.lastSignedAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })}</b></span>}
                              {q.lastSignedBy && <span>👤 חתם: <b>{q.lastSignedBy}</b></span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 p-3 bg-slate-50 shrink-0">
              <button onClick={() => setOpen(false)} className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm">סגור</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
