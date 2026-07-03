"use client";

import { useMemo, useState } from "react";
import { Card, Table, Th, Td, EmptyState } from "@/components/ui";

type Row = {
  id: string;
  itemName: string;
  sku: string | null;
  category: string;
  serial: string | null;
  lotQuantity: number | null;
  expiryISO: string;
  daysLeft: number;
  alertDays: number;
  state: "expired" | "alert" | "ok";
  holder: string;
  soldier: string | null;
  location: string | null;
  statusName: string;
};

const STATE_META: Record<Row["state"], { label: string; badge: string; row: string }> = {
  expired: { label: "פג תוקף", badge: "bg-rose-100 text-rose-800 border-rose-300", row: "bg-rose-50" },
  alert: { label: "פג בקרוב", badge: "bg-amber-100 text-amber-800 border-amber-300", row: "bg-amber-50/60" },
  ok: { label: "בתוקף", badge: "bg-emerald-100 text-emerald-700 border-emerald-300", row: "" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
}
function fmtDaysLeft(d: number) {
  if (d < 0) return `לפני ${Math.abs(d)} ימים`;
  if (d === 0) return "היום";
  return `בעוד ${d} ימים`;
}

export default function ExpiryView({ rows, expiredCount, alertCount }: { rows: Row[]; expiredCount: number; alertCount: number }) {
  const [filter, setFilter] = useState<"all" | "expired" | "alert">("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    let r = rows;
    if (filter === "expired") r = r.filter((x) => x.state === "expired");
    else if (filter === "alert") r = r.filter((x) => x.state === "alert" || x.state === "expired");
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      r = r.filter((x) =>
        x.itemName.toLowerCase().includes(s) ||
        (x.serial ?? "").toLowerCase().includes(s) ||
        (x.soldier ?? "").toLowerCase().includes(s) ||
        x.holder.toLowerCase().includes(s));
    }
    return r;
  }, [rows, filter, q]);

  return (
    <div>
      {(expiredCount > 0 || alertCount > 0) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {expiredCount > 0 && (
            <div className="flex-1 min-w-40 bg-rose-50 border border-rose-200 rounded-xl p-3">
              <div className="text-xs text-rose-700">🔴 פג תוקף</div>
              <div className="text-2xl font-bold text-rose-700">{expiredCount}</div>
            </div>
          )}
          {alertCount > 0 && (
            <div className="flex-1 min-w-40 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <div className="text-xs text-amber-700">🟡 פג בקרוב</div>
              <div className="text-2xl font-bold text-amber-700">{alertCount}</div>
            </div>
          )}
          <div className="flex-1 min-w-40 bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div className="text-xs text-slate-500">סה"כ עם תוקף</div>
            <div className="text-2xl font-bold text-slate-700">{rows.length}</div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3 items-center">
        {([["all", "הכל"], ["alert", "פג / פג בקרוב"], ["expired", "פג תוקף בלבד"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`px-3 py-1.5 rounded-full text-sm border transition ${filter === v ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-300 hover:bg-slate-50"}`}>
            {l}
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש פריט / סריאלי / חייל..."
          className="flex-1 min-w-48 border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState>אין ציוד עם תוקף להצגה</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr><Th>פריט</Th><Th>סריאלי</Th><Th>תוקף</Th><Th>נותרו</Th><Th>סטטוס</Th><Th>מחזיק</Th><Th>מיקום</Th></tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const m = STATE_META[r.state];
                  return (
                    <tr key={r.id} className={m.row}>
                      <Td>
                        <div className="font-medium text-sm">{r.itemName}</div>
                        <div className="text-[11px] text-slate-400">{r.category}{r.lotQuantity ? ` · ×${r.lotQuantity}` : ""}</div>
                      </Td>
                      <Td className="font-mono text-xs">{r.serial ?? "—"}</Td>
                      <Td className="text-xs whitespace-nowrap">{fmtDate(r.expiryISO)}</Td>
                      <Td className={`text-xs whitespace-nowrap font-medium ${r.state === "expired" ? "text-rose-600" : r.state === "alert" ? "text-amber-700" : "text-slate-500"}`}>{fmtDaysLeft(r.daysLeft)}</Td>
                      <Td><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${m.badge}`}>{m.label}</span></Td>
                      <Td className="text-xs">{r.soldier ? `👤 ${r.soldier}` : r.holder}</Td>
                      <Td className="text-xs text-slate-500">{r.location ?? "—"}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
