"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { Card } from "@/components/ui";
import {
  createVerificationRequests,
  getVerificationStatus,
  markVerificationSent,
  sendTelegramVerification,
  deleteVerificationData,
} from "../actions";

type ItemTypeOption = { id: string; name: string };

type VerReq = {
  id: string;
  token: string;
  soldierName: string;
  phone: string | null;
  sentAt: string | null;
  sentVia: string | null;
  respondedAt: string | null;
  items: {
    id: string;
    itemTypeName: string;
    serialNumber: string;
    status: string;
    photoData: string | null;
    note: string | null;
  }[];
};

export default function VerificationPanel({
  sessionId,
  itemTypes,
}: {
  sessionId: string;
  itemTypes: ItemTypeOption[];
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"pick" | "send" | "status">("pick");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [requests, setRequests] = useState<VerReq[]>([]);
  const [pending, startTransition] = useTransition();
  const [whatsappQueue, setWhatsappQueue] = useState<VerReq[]>([]);
  const [whatsappIdx, setWhatsappIdx] = useState(0);

  const loadStatus = useCallback(() => {
    startTransition(async () => {
      const data = await getVerificationStatus(sessionId);
      setRequests(data);
      if (data.length > 0) setStep("status");
    });
  }, [sessionId]);

  useEffect(() => {
    if (open) loadStatus();
  }, [open, loadStatus]);

  const handleCreate = () => {
    if (selected.size === 0) return;
    startTransition(async () => {
      const result = await createVerificationRequests(sessionId, Array.from(selected));
      if (result.error) return alert(result.error);
      loadStatus();
      setStep("send");
    });
  };

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const startWhatsapp = () => {
    const unsent = requests.filter((r) => !r.sentAt && r.phone);
    if (unsent.length === 0) return alert("אין חיילים עם מספר טלפון שלא נשלח אליהם");
    setWhatsappQueue(unsent);
    setWhatsappIdx(0);
    openWhatsapp(unsent[0]);
  };

  const openWhatsapp = (req: VerReq) => {
    const phone = req.phone!.replace(/^0/, "972");
    const url = `${baseUrl}/verify/${req.token}`;
    const items = req.items.map((i) => `• ${i.itemTypeName} (${i.serialNumber})`).join("\n");
    const msg = `🔍 אימות ציוד\n\nשלום ${req.soldierName},\nנדרש אימות שהציוד הבא נמצא ברשותך:\n\n${items}\n\n👉 ${url}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
    startTransition(async () => {
      await markVerificationSent(req.id, "WHATSAPP");
    });
  };

  const nextWhatsapp = () => {
    const next = whatsappIdx + 1;
    if (next >= whatsappQueue.length) {
      setWhatsappQueue([]);
      loadStatus();
      return;
    }
    setWhatsappIdx(next);
    openWhatsapp(whatsappQueue[next]);
  };

  const handleTelegram = (req: VerReq) => {
    startTransition(async () => {
      const result = await sendTelegramVerification(req.id);
      if (result.error) return alert(result.error);
      loadStatus();
    });
  };

  const sendAllTelegram = () => {
    const unsent = requests.filter((r) => !r.sentAt && r.items[0]);
    startTransition(async () => {
      for (const req of unsent) {
        const result = await sendTelegramVerification(req.id);
        if (result.error) continue;
      }
      loadStatus();
    });
  };

  const stats = {
    total: requests.length,
    sent: requests.filter((r) => r.sentAt).length,
    responded: requests.filter((r) => r.respondedAt).length,
    confirmed: requests.flatMap((r) => r.items).filter((i) => i.status === "CONFIRMED").length,
    denied: requests.flatMap((r) => r.items).filter((i) => i.status === "DENIED").length,
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl px-4 py-3 text-sm text-indigo-700 font-medium transition"
      >
        🔍 אימות ציוד מול חיילים
      </button>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-700">🔍 אימות ציוד</h3>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
      </div>

      {step === "pick" && (
        <div>
          <p className="text-sm text-slate-500 mb-3">בחר סוגי פריטים סריאליים לאימות מול חיילים:</p>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {itemTypes.map((it) => (
              <label key={it.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 rounded p-1.5">
                <input
                  type="checkbox"
                  checked={selected.has(it.id)}
                  onChange={(e) => {
                    setSelected((s) => {
                      const n = new Set(s);
                      if (e.target.checked) n.add(it.id); else n.delete(it.id);
                      return n;
                    });
                  }}
                  className="w-4 h-4"
                />
                {it.name}
              </label>
            ))}
          </div>
          <button
            onClick={handleCreate}
            disabled={selected.size === 0 || pending}
            className="mt-3 w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-bold"
          >
            {pending ? "יוצר בקשות..." : `צור בקשות אימות (${selected.size} סוגי פריטים)`}
          </button>
        </div>
      )}

      {step === "send" && requests.length > 0 && (
        <div>
          <p className="text-sm text-slate-600 mb-3">
            נוצרו <b>{requests.length}</b> בקשות אימות. בחר ערוץ שליחה:
          </p>
          <div className="flex gap-2 mb-4">
            <button onClick={startWhatsapp} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2.5 text-sm font-bold">
              📱 WhatsApp
            </button>
            <button onClick={sendAllTelegram} disabled={pending} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-bold">
              {pending ? "שולח..." : "🤖 Telegram"}
            </button>
          </div>
          <button onClick={() => setStep("status")} className="w-full text-sm text-indigo-600 hover:underline">
            מעבר למעקב סטטוס →
          </button>
        </div>
      )}

      {whatsappQueue.length > 0 && (
        <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <p className="text-sm font-medium text-emerald-800 mb-2">
            שליחת WhatsApp ({whatsappIdx + 1}/{whatsappQueue.length})
          </p>
          <p className="text-xs text-emerald-700">
            נשלח ל: <b>{whatsappQueue[whatsappIdx]?.soldierName}</b>
          </p>
          <div className="flex gap-2 mt-2">
            <button onClick={nextWhatsapp} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2 text-xs font-bold">
              {whatsappIdx + 1 < whatsappQueue.length ? `הבא: ${whatsappQueue[whatsappIdx + 1]?.soldierName}` : "סיום"}
            </button>
          </div>
        </div>
      )}

      {step === "status" && (
        <div>
          <div className="grid grid-cols-4 gap-2 mb-4 text-center">
            <div className="bg-slate-50 rounded-lg p-2">
              <div className="text-lg font-bold text-slate-700">{stats.total}</div>
              <div className="text-[10px] text-slate-500">בקשות</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-2">
              <div className="text-lg font-bold text-blue-700">{stats.sent}</div>
              <div className="text-[10px] text-blue-500">נשלחו</div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-2">
              <div className="text-lg font-bold text-emerald-700">{stats.confirmed}</div>
              <div className="text-[10px] text-emerald-500">אושרו</div>
            </div>
            <div className="bg-rose-50 rounded-lg p-2">
              <div className="text-lg font-bold text-rose-700">{stats.denied}</div>
              <div className="text-[10px] text-rose-500">לא נמצאו</div>
            </div>
          </div>

          <div className="flex gap-2 mb-3">
            <button onClick={startWhatsapp} className="text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg px-3 py-1.5 font-medium">
              📱 שלח WhatsApp
            </button>
            <button onClick={sendAllTelegram} disabled={pending} className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg px-3 py-1.5 font-medium">
              🤖 שלח Telegram
            </button>
            <button onClick={loadStatus} disabled={pending} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg px-3 py-1.5">
              🔄 רענן
            </button>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {requests.map((req) => (
              <div key={req.id} className={`border rounded-lg p-2.5 text-xs ${req.respondedAt ? "bg-emerald-50/50 border-emerald-200" : req.sentAt ? "bg-blue-50/50 border-blue-200" : "border-slate-200"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{req.soldierName}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    req.respondedAt ? "bg-emerald-100 text-emerald-700" : req.sentAt ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    {req.respondedAt ? "✅ דווח" : req.sentAt ? `📤 ${req.sentVia}` : "⏳ ממתין"}
                  </span>
                </div>
                <div className="text-slate-500">
                  {req.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <span>{item.itemTypeName} ({item.serialNumber})</span>
                      {item.status === "CONFIRMED" && <span className="text-emerald-600 font-bold">✅</span>}
                      {item.status === "DENIED" && (
                        <span className="text-rose-600 font-bold" title={item.note || undefined}>❌{item.note ? ` ${item.note}` : ""}</span>
                      )}
                    </div>
                  ))}
                </div>
                {!req.sentAt && (
                  <div className="flex gap-1.5 mt-1.5">
                    {req.phone && (
                      <button onClick={() => { openWhatsapp(req); }} className="text-[10px] bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded px-2 py-0.5">
                        📱 WhatsApp
                      </button>
                    )}
                    <button onClick={() => handleTelegram(req)} disabled={pending} className="text-[10px] bg-blue-100 hover:bg-blue-200 text-blue-700 rounded px-2 py-0.5">
                      🤖 Telegram
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {requests.length === 0 && (
            <div className="text-center py-4">
              <p className="text-sm text-slate-400">אין בקשות אימות. לחץ למטה ליצירה.</p>
              <button onClick={() => setStep("pick")} className="mt-2 text-sm text-indigo-600 hover:underline">
                ← בחר פריטים לאימות
              </button>
            </div>
          )}

          {requests.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between">
              <button onClick={() => setStep("pick")} className="text-xs text-indigo-600 hover:underline">
                + הוסף סוגי פריטים
              </button>
              <button
                onClick={() => {
                  if (!confirm("למחוק את כל נתוני האימות כולל תמונות?")) return;
                  startTransition(async () => {
                    const r = await deleteVerificationData(sessionId);
                    if (r.error) return alert(r.error);
                    setRequests([]);
                    setStep("pick");
                  });
                }}
                disabled={pending}
                className="text-xs text-rose-500 hover:text-rose-700"
              >
                🗑️ מחק נתוני אימות
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
