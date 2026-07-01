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

const MODES = [
  { value: "CONFIRM", label: "✅ אישור קיום", desc: "נמצא / לא נמצא" },
  { value: "SERIAL_ENTRY", label: "🔢 הקשת מק״ט", desc: "החייל מקליד את המספר הסריאלי" },
  { value: "LOCATION", label: "📍 בחירת מיקום", desc: "החייל בוחר מיקום מרשימה" },
  { value: "QUANTITY_CONFIRM", label: "📦 אישור כמות", desc: "רואה כמות צפויה, מאשר או מתקן" },
  { value: "BLIND_COUNT", label: "🔍 ספירה עיוורת", desc: "מקליד כמות בלי מידע מקדים" },
  { value: "BATCH", label: "📋 אצווה", desc: "מאשר קבוצת פריטים יחד" },
] as const;

type VerReq = {
  id: string;
  token: string;
  mode: string;
  soldierName: string | null;
  holderName: string | null;
  holderKind: string | null;
  companyName: string | null;
  phone: string | null;
  hasTelegram: boolean;
  sentAt: string | null;
  sentVia: string | null;
  respondedAt: string | null;
  items: {
    id: string;
    itemTypeName: string;
    serialNumber: string | null;
    status: string;
    photoData: string | null;
    note: string | null;
    expectedQuantity: number | null;
    reportedQuantity: number | null;
    reportedSerial: string | null;
    reportedLocation: string | null;
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
  const [step, setStep] = useState<"pick" | "send" | "status" | "report">("pick");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState("CONFIRM");
  const [requests, setRequests] = useState<VerReq[]>([]);
  const [pending, startTransition] = useTransition();
  const [whatsappQueue, setWhatsappQueue] = useState<VerReq[]>([]);
  const [whatsappIdx, setWhatsappIdx] = useState(0);
  const [groupBy, setGroupBy] = useState<"all" | "company">("all");
  const [reportFilter, setReportFilter] = useState<"all" | "pending" | "confirmed" | "denied" | "not_sent">("all");
  const [reportCompany, setReportCompany] = useState<string>("all");

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
      const result = await createVerificationRequests(sessionId, Array.from(selected), mode);
      if (result.error) return alert(result.error);
      loadStatus();
      setStep("send");
    });
  };

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const startWhatsapp = () => {
    const unsent = requests.filter((r) => !r.respondedAt && r.phone && r.soldierName);
    if (unsent.length === 0) return alert("אין חיילים עם מספר טלפון שטרם דיווחו");
    setWhatsappQueue(unsent);
    setWhatsappIdx(0);
    openWhatsapp(unsent[0]);
  };

  const openWhatsapp = (req: VerReq) => {
    const phone = req.phone!.replace(/^0/, "972");
    const url = `${baseUrl}/verify/${req.token}`;
    const items = req.items.map((i) => i.serialNumber ? `• ${i.itemTypeName} (${i.serialNumber})` : `• ${i.itemTypeName}`).join("\n");
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
    const unsent = requests.filter((r) => !r.sentAt && r.hasTelegram);
    startTransition(async () => {
      for (const req of unsent) {
        await sendTelegramVerification(req.id);
      }
      loadStatus();
    });
  };

  // Group requests by company for report view
  const byCompany = new Map<string, VerReq[]>();
  for (const req of requests) {
    const key = req.companyName || req.holderName || "ללא שיוך";
    const arr = byCompany.get(key) || [];
    arr.push(req);
    byCompany.set(key, arr);
  }

  const stats = {
    total: requests.length,
    soldiers: requests.filter((r) => r.soldierName).length,
    holders: requests.filter((r) => r.holderName && !r.soldierName).length,
    sent: requests.filter((r) => r.sentAt).length,
    responded: requests.filter((r) => r.respondedAt).length,
    confirmed: requests.flatMap((r) => r.items).filter((i) => i.status === "CONFIRMED").length,
    denied: requests.flatMap((r) => r.items).filter((i) => i.status === "DENIED").length,
    pending: requests.flatMap((r) => r.items).filter((i) => i.status === "PENDING").length,
  };

  const filteredRequests = requests.filter((r) => {
    if (reportCompany !== "all") {
      const company = r.companyName || r.holderName || "ללא שיוך";
      if (company !== reportCompany) return false;
    }
    if (reportFilter === "pending") return !r.respondedAt;
    if (reportFilter === "confirmed") return r.respondedAt && r.items.every((i) => i.status === "CONFIRMED");
    if (reportFilter === "denied") return r.items.some((i) => i.status === "DENIED");
    if (reportFilter === "not_sent") return !r.sentAt;
    return true;
  });

  const filteredByCompany = new Map<string, VerReq[]>();
  for (const req of filteredRequests) {
    const key = req.companyName || req.holderName || "ללא שיוך";
    const arr = filteredByCompany.get(key) || [];
    arr.push(req);
    filteredByCompany.set(key, arr);
  }

  const printReport = () => {
    const now = new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
    const filterLabel = { all: "הכל", pending: "טרם דיווחו", confirmed: "אושרו", denied: "חסרים", not_sent: "לא נשלחו" }[reportFilter];
    const rows: string[] = [];
    for (const [companyName, reqs] of filteredByCompany) {
      const companyItems = reqs.flatMap((r) => r.items);
      const cConfirmed = companyItems.filter((i) => i.status === "CONFIRMED").length;
      const cDenied = companyItems.filter((i) => i.status === "DENIED").length;
      const cPending = companyItems.filter((i) => i.status === "PENDING").length;
      rows.push(`<tr style="background:#f1f5f9"><td colspan="5" style="padding:8px;font-weight:bold">📍 ${companyName} — ✅${cConfirmed} ❌${cDenied} ⏳${cPending}</td></tr>`);
      for (const req of reqs) {
        const name = req.soldierName || req.holderName || "—";
        const statusLabel = req.respondedAt ? "דווח" : req.sentAt ? "נשלח" : "ממתין";
        for (const item of req.items) {
          const extra = [
            item.reportedSerial && `סריאלי: ${item.reportedSerial}`,
            item.reportedLocation && `מיקום: ${item.reportedLocation}`,
            item.reportedQuantity != null && `כמות: ${item.reportedQuantity}`,
            item.note,
          ].filter(Boolean).join(", ");
          rows.push(`<tr><td style="padding:4px 8px">${name}</td><td style="padding:4px 8px">${item.itemTypeName}${item.serialNumber ? ` (${item.serialNumber})` : ""}</td><td style="padding:4px 8px">${item.status === "CONFIRMED" ? "✅" : item.status === "DENIED" ? "❌" : "⏳"}</td><td style="padding:4px 8px">${statusLabel}</td><td style="padding:4px 8px;font-size:11px;color:#666">${extra}</td></tr>`);
        }
      }
    }
    const fStats = {
      total: filteredRequests.length,
      confirmed: filteredRequests.flatMap((r) => r.items).filter((i) => i.status === "CONFIRMED").length,
      denied: filteredRequests.flatMap((r) => r.items).filter((i) => i.status === "DENIED").length,
      pending: filteredRequests.flatMap((r) => r.items).filter((i) => i.status === "PENDING").length,
    };
    const html = `<html dir="rtl"><head><title>דוח אימות ציוד</title><style>body{font-family:system-ui;padding:20px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;text-align:right}th{background:#334155;color:white;padding:8px}@media print{body{padding:0}}</style></head><body><h2>דוח אימות ציוד</h2><p>תאריך: ${now} | סינון: ${filterLabel}${reportCompany !== "all" ? ` | פלוגה: ${reportCompany}` : ""} | סה"כ: ${fStats.total} בקשות | ✅ ${fStats.confirmed} | ❌ ${fStats.denied} | ⏳ ${fStats.pending}</p><table><tr><th>שם</th><th>פריט</th><th>סטטוס</th><th>שליחה</th><th>פרטים</th></tr>${rows.join("")}</table></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl px-4 py-3 text-sm text-indigo-700 font-medium transition"
      >
        🔍 אימות ציוד מול חיילים ופלוגות
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
          <p className="text-sm text-slate-500 mb-3">בחר סוגי פריטים ומצב אימות:</p>

          {/* Mode selection */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">מצב אימות:</label>
            <div className="grid grid-cols-2 gap-1.5">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  className={`text-right p-2 rounded-lg border text-xs transition ${
                    mode === m.value
                      ? "border-indigo-400 bg-indigo-50 text-indigo-800"
                      : "border-slate-200 hover:bg-slate-50 text-slate-600"
                  }`}
                >
                  <div className="font-medium">{m.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Item type selection */}
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
            {pending ? "יוצר בקשות..." : `צור בקשות אימות (${selected.size} סוגים)`}
          </button>
        </div>
      )}

      {step === "send" && requests.length > 0 && (
        <div>
          <p className="text-sm text-slate-600 mb-3">
            נוצרו <b>{stats.soldiers}</b> בקשות לחיילים
            {stats.holders > 0 && <> ו-<b>{stats.holders}</b> לפלוגות/מחסנים</>}.
            בחר ערוץ שליחה:
          </p>
          <div className="flex gap-2 mb-4">
            <button onClick={startWhatsapp} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2.5 text-sm font-bold">
              📱 WhatsApp
            </button>
            <button onClick={sendAllTelegram} disabled={pending} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-bold">
              {pending ? "שולח..." : "🤖 Telegram"}
            </button>
          </div>
          {stats.holders > 0 && (
            <p className="text-xs text-slate-400 mb-2">בקשות לפלוגות/מחסנים — העבר לינק אימות למפקד הפלוגה</p>
          )}
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
          {/* Summary stats */}
          <div className="grid grid-cols-5 gap-1.5 mb-4 text-center">
            <div className="bg-slate-50 rounded-lg p-2">
              <div className="text-lg font-bold text-slate-700">{stats.total}</div>
              <div className="text-[10px] text-slate-500">בקשות</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-2">
              <div className="text-lg font-bold text-blue-700">{stats.sent}</div>
              <div className="text-[10px] text-blue-500">נשלחו</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-2">
              <div className="text-lg font-bold text-amber-700">{stats.pending}</div>
              <div className="text-[10px] text-amber-500">ממתינים</div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-2">
              <div className="text-lg font-bold text-emerald-700">{stats.confirmed}</div>
              <div className="text-[10px] text-emerald-500">אושרו</div>
            </div>
            <div className="bg-rose-50 rounded-lg p-2">
              <div className="text-lg font-bold text-rose-700">{stats.denied}</div>
              <div className="text-[10px] text-rose-500">חסרים</div>
            </div>
          </div>

          {/* Actions bar */}
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={startWhatsapp} className="text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg px-3 py-1.5 font-medium">
              📱 שלח WhatsApp
            </button>
            <button onClick={sendAllTelegram} disabled={pending} className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg px-3 py-1.5 font-medium">
              🤖 שלח Telegram
            </button>
            {requests.some((r) => r.sentAt && !r.respondedAt) && (
              <button
                onClick={() => {
                  const unanswered = requests.filter((r) => r.sentAt && !r.respondedAt);
                  startTransition(async () => {
                    for (const req of unanswered) {
                      if (req.hasTelegram) await sendTelegramVerification(req.id);
                    }
                    loadStatus();
                  });
                }}
                disabled={pending}
                className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg px-3 py-1.5 font-medium"
              >
                🔁 שלח שוב ({requests.filter((r) => r.sentAt && !r.respondedAt).length})
              </button>
            )}
            <button onClick={loadStatus} disabled={pending} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg px-3 py-1.5">
              🔄 רענן
            </button>
            <button
              onClick={() => setGroupBy(groupBy === "all" ? "company" : "all")}
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg px-3 py-1.5"
            >
              {groupBy === "all" ? "📊 קבץ לפי פלוגה" : "📋 הצג הכל"}
            </button>
            <button
              onClick={() => { setReportFilter("all"); setReportCompany("all"); setStep("report"); }}
              className="text-xs bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg px-3 py-1.5 font-medium"
            >
              📊 דוח ביצוע
            </button>
          </div>

          {/* Grouped by company view */}
          {groupBy === "company" ? (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {Array.from(byCompany.entries()).map(([companyName, reqs]) => {
                const companyItems = reqs.flatMap((r) => r.items);
                const cConfirmed = companyItems.filter((i) => i.status === "CONFIRMED").length;
                const cDenied = companyItems.filter((i) => i.status === "DENIED").length;
                const cPending = companyItems.filter((i) => i.status === "PENDING").length;
                const cResponded = reqs.filter((r) => r.respondedAt).length;
                return (
                  <div key={companyName} className="border rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-3 py-2 flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-700">📍 {companyName}</span>
                      <div className="flex gap-2 text-[10px]">
                        <span className="text-slate-500">{reqs.length} בקשות</span>
                        <span className="text-emerald-600">✅{cConfirmed}</span>
                        <span className="text-rose-600">❌{cDenied}</span>
                        <span className="text-amber-600">⏳{cPending}</span>
                        <span className="text-blue-600">{cResponded}/{reqs.length} דיווחו</span>
                      </div>
                    </div>
                    <div className="divide-y">
                      {reqs.map((req) => (
                        <RequestCard key={req.id} req={req} pending={pending} onTelegram={() => handleTelegram(req)} onWhatsapp={() => openWhatsapp(req)} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {requests.map((req) => (
                <RequestCard key={req.id} req={req} pending={pending} onTelegram={() => handleTelegram(req)} onWhatsapp={() => openWhatsapp(req)} />
              ))}
            </div>
          )}

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
      {step === "report" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-sm text-slate-700">📊 דוח ביצוע אימות</h4>
            <button onClick={() => setStep("status")} className="text-xs text-indigo-600 hover:underline">← חזרה</button>
          </div>

          {/* Filters */}
          <div className="flex gap-2 mb-3 flex-wrap">
            <select
              value={reportFilter}
              onChange={(e) => setReportFilter(e.target.value as typeof reportFilter)}
              className="border rounded-lg px-2 py-1.5 text-xs"
            >
              <option value="all">כל הסטטוסים</option>
              <option value="pending">טרם דיווחו</option>
              <option value="not_sent">לא נשלחו</option>
              <option value="confirmed">אושרו</option>
              <option value="denied">חסרים / לא נמצאו</option>
            </select>
            <select
              value={reportCompany}
              onChange={(e) => setReportCompany(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-xs"
            >
              <option value="all">כל הפלוגות</option>
              {Array.from(byCompany.keys()).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Summary bar */}
          <div className="grid grid-cols-4 gap-1.5 mb-3 text-center">
            <div className="bg-slate-50 rounded-lg p-1.5">
              <div className="text-base font-bold text-slate-700">{filteredRequests.length}</div>
              <div className="text-[10px] text-slate-500">בקשות</div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-1.5">
              <div className="text-base font-bold text-emerald-700">{filteredRequests.filter((r) => r.respondedAt && r.items.every((i) => i.status === "CONFIRMED")).length}</div>
              <div className="text-[10px] text-emerald-500">הושלמו</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-1.5">
              <div className="text-base font-bold text-amber-700">{filteredRequests.filter((r) => !r.respondedAt).length}</div>
              <div className="text-[10px] text-amber-500">ממתינים</div>
            </div>
            <div className="bg-rose-50 rounded-lg p-1.5">
              <div className="text-base font-bold text-rose-700">{filteredRequests.filter((r) => r.items.some((i) => i.status === "DENIED")).length}</div>
              <div className="text-[10px] text-rose-500">חסרים</div>
            </div>
          </div>

          {/* Progress bar */}
          {requests.length > 0 && (() => {
            const responded = requests.filter((r) => r.respondedAt).length;
            const pct = Math.round((responded / requests.length) * 100);
            return (
              <div className="mb-3">
                <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                  <span>התקדמות כללית</span>
                  <span>{responded}/{requests.length} ({pct}%)</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })()}

          {/* Filtered results by company */}
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {filteredRequests.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-4">אין תוצאות לסינון הנוכחי</p>
            ) : (
              Array.from(filteredByCompany.entries()).map(([companyName, reqs]) => {
                const companyItems = reqs.flatMap((r) => r.items);
                const cConfirmed = companyItems.filter((i) => i.status === "CONFIRMED").length;
                const cDenied = companyItems.filter((i) => i.status === "DENIED").length;
                const cPending = companyItems.filter((i) => i.status === "PENDING").length;
                const cResponded = reqs.filter((r) => r.respondedAt).length;
                return (
                  <div key={companyName} className="border rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-3 py-2 flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-700">📍 {companyName}</span>
                      <div className="flex gap-2 text-[10px]">
                        <span className="text-emerald-600">✅{cConfirmed}</span>
                        <span className="text-rose-600">❌{cDenied}</span>
                        <span className="text-amber-600">⏳{cPending}</span>
                        <span className="text-blue-600">{cResponded}/{reqs.length}</span>
                      </div>
                    </div>
                    <div className="divide-y text-xs">
                      {reqs.map((req) => {
                        const name = req.soldierName || req.holderName || "—";
                        const icon = req.soldierName ? "👤" : req.holderKind === "WAREHOUSE" ? "🏭" : "🏢";
                        return (
                          <div key={req.id} className={`px-3 py-2 ${req.respondedAt ? "" : "bg-amber-50/30"}`}>
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{icon} {name}</span>
                              <span className={`text-[10px] font-bold ${
                                req.respondedAt ? "text-emerald-600" : req.sentAt ? "text-blue-600" : "text-slate-400"
                              }`}>
                                {req.respondedAt ? "✅ דווח" : req.sentAt ? `📤 ${req.sentVia}` : "⏳ טרם נשלח"}
                              </span>
                            </div>
                            {req.items.map((item) => (
                              <div key={item.id} className="flex items-center justify-between text-[11px] text-slate-500 mt-0.5">
                                <span>{item.itemTypeName}{item.serialNumber ? ` (${item.serialNumber})` : ""}{item.expectedQuantity != null ? ` ×${item.expectedQuantity}` : ""}</span>
                                <div className="flex items-center gap-1.5">
                                  {item.reportedSerial && <span className="text-blue-600 font-mono text-[10px]">{item.reportedSerial}</span>}
                                  {item.reportedLocation && <span className="text-blue-600 text-[10px]">📍{item.reportedLocation}</span>}
                                  {item.reportedQuantity != null && <span className="text-blue-600 text-[10px]">×{item.reportedQuantity}</span>}
                                  {item.status === "CONFIRMED" && <span className="text-emerald-600">✅</span>}
                                  {item.status === "DENIED" && <span className="text-rose-600" title={item.note || undefined}>❌</span>}
                                  {item.note && <span className="text-rose-500 text-[10px]">{item.note}</span>}
                                </div>
                              </div>
                            ))}
                            {!req.respondedAt && (req.phone || req.hasTelegram) && (
                              <div className="flex gap-1.5 mt-1">
                                {req.phone && (
                                  <button onClick={() => openWhatsapp(req)} className="text-[10px] bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded px-2 py-0.5">
                                    📱 {req.sentAt ? "שלח שוב" : "WhatsApp"}
                                  </button>
                                )}
                                {req.hasTelegram && (
                                  <button onClick={() => handleTelegram(req)} disabled={pending} className="text-[10px] bg-blue-100 hover:bg-blue-200 text-blue-700 rounded px-2 py-0.5">
                                    🤖 {req.sentAt ? "שלח שוב" : "Telegram"}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Print button */}
          {filteredRequests.length > 0 && (
            <button
              onClick={printReport}
              className="w-full mt-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg py-2.5 text-sm font-bold transition"
            >
              🖨️ הדפס דוח ({filteredRequests.length} בקשות)
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function RequestCard({ req, pending, onTelegram, onWhatsapp }: {
  req: VerReq;
  pending: boolean;
  onTelegram: () => void;
  onWhatsapp: () => void;
}) {
  const name = req.soldierName || req.holderName || "—";
  const icon = req.soldierName ? "👤" : req.holderKind === "WAREHOUSE" ? "🏭" : "🏢";
  const modeLabel = MODES.find((m) => m.value === req.mode)?.label || req.mode;

  return (
    <div className={`border rounded-lg p-2.5 text-xs ${
      req.respondedAt ? "bg-emerald-50/50 border-emerald-200" : req.sentAt ? "bg-blue-50/50 border-blue-200" : "border-slate-200"
    }`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium">{icon} {name}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-slate-400 bg-slate-100 rounded px-1">{modeLabel}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
            req.respondedAt ? "bg-emerald-100 text-emerald-700" : req.sentAt ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
          }`}>
            {req.respondedAt ? "✅ דווח" : req.sentAt ? `📤 ${req.sentVia}` : "⏳ ממתין"}
          </span>
        </div>
      </div>
      {req.companyName && req.soldierName && (
        <div className="text-[10px] text-slate-400 mb-1">📍 {req.companyName}</div>
      )}
      <div className="text-slate-500">
        {req.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between">
            <span>{item.itemTypeName}{item.serialNumber ? ` (${item.serialNumber})` : ""}{item.expectedQuantity != null ? ` × ${item.expectedQuantity}` : ""}</span>
            <div className="flex items-center gap-1">
              {item.reportedQuantity != null && <span className="text-blue-600">דווח: {item.reportedQuantity}</span>}
              {item.reportedSerial && <span className="text-blue-600 font-mono">{item.reportedSerial}</span>}
              {item.reportedLocation && <span className="text-blue-600">📍{item.reportedLocation}</span>}
              {item.status === "CONFIRMED" && <span className="text-emerald-600 font-bold">✅</span>}
              {item.status === "DENIED" && (
                <span className="text-rose-600 font-bold" title={item.note || undefined}>❌{item.note ? ` ${item.note}` : ""}</span>
              )}
            </div>
          </div>
        ))}
      </div>
      {(!req.sentAt || (!req.respondedAt && req.sentAt)) && (
        <div className="flex gap-1.5 mt-1.5">
          {req.phone && (
            <button onClick={onWhatsapp} className="text-[10px] bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded px-2 py-0.5">
              📱 {req.sentAt ? "שלח שוב" : "WhatsApp"}
            </button>
          )}
          {req.hasTelegram && (
            <button onClick={onTelegram} disabled={pending} className="text-[10px] bg-blue-100 hover:bg-blue-200 text-blue-700 rounded px-2 py-0.5">
              🤖 {req.sentAt ? "שלח שוב" : "Telegram"}
            </button>
          )}
          {!req.soldierName && (
            <span className="text-[10px] text-slate-400">לינק: /verify/{req.token.slice(0, 8)}...</span>
          )}
        </div>
      )}
    </div>
  );
}
