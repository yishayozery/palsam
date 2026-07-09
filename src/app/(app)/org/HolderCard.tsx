"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import { ROLE_LABELS, WAREHOUSE_TYPE_SHORT, WAREHOUSE_TYPE_ICON } from "@/lib/rbac";
import type { WarehouseType } from "@/generated/prisma";
import { renameHolder, toggleHolder } from "./actions";
import HolderDetailsModal, { type HolderRowDetail } from "./HolderDetailsModal";

export default function HolderCard({ row, kind, baseUrl = "" }: { row: HolderRowDetail; kind: "WAREHOUSE" | "COMPANY"; baseUrl?: string }) {
  const [open, setOpen] = useState(false);
  const [editName, setEditName] = useState(false);
  const router = useRouter();
  const [, startToggle] = useTransition();
  function doToggle() {
    const msg = row.active
      ? `⚠️ להשבית את "${row.name}"?\n\nהשבתה חוסמת ניפוקים, החתמות וקליטות. ניתן להפעיל מחדש מאוחר יותר.`
      : `להפעיל מחדש את "${row.name}"?`;
    if (!confirm(msg)) return;
    const fd = new FormData(); fd.set("id", row.id);
    startToggle(async () => { const r = await toggleHolder(fd); if (r?.error) alert("🚫 " + r.error); router.refresh(); });
  }

  const icon = kind === "WAREHOUSE" && row.warehouseType
    ? WAREHOUSE_TYPE_ICON[row.warehouseType]
    : kind === "COMPANY" ? "🪖" : "📦";
  const typeLabel = row.warehouseType ? WAREHOUSE_TYPE_SHORT[row.warehouseType] : "";
  const officerCount = row.users.length;
  const soldierCount = row.soldiers?.length ?? 0;

  return (
    <>
      <div className={`relative bg-white border rounded-2xl overflow-hidden hover:shadow-md transition cursor-pointer ${row.active ? "border-slate-200" : "border-slate-200 opacity-60"}`}
        onClick={() => setOpen(true)}>
        <div className="p-4">
          {/* כותרת */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2 min-w-0">
              {row.logoData ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.logoData} alt={row.name}
                  className="w-12 h-12 object-contain rounded shrink-0 bg-white border border-slate-200" />
              ) : (
                <span className="text-3xl shrink-0">{icon}</span>
              )}
              <div className="min-w-0">
                {editName ? (
                  <form action={async (fd) => { await renameHolder(fd); setEditName(false); }} className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}>
                    <input type="hidden" name="id" value={row.id} />
                    <input name="name" defaultValue={row.name} autoFocus required
                      className="rounded border border-slate-300 px-2 py-1 text-sm w-32" />
                    <button className="text-xs text-emerald-700">✓</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setEditName(false); }} className="text-xs text-slate-500">✕</button>
                  </form>
                ) : (
                  <div>
                    <div className="font-bold text-slate-800 truncate text-sm">{row.name}</div>
                    {typeLabel && <div className="text-[11px] text-slate-500">{typeLabel}</div>}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => setEditName(true)} className="text-xs text-slate-400 hover:text-slate-700 px-1.5 py-1" title="ערוך שם">
                ✎
              </button>
              <button type="button" onClick={doToggle} className="text-xs text-slate-400 hover:text-rose-600 px-1.5 py-1" title={row.active ? "השבת" : "הפעל"}>
                {row.active ? "🚫" : "↻"}
              </button>
            </div>
          </div>

          {/* מונים */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className="bg-blue-50 rounded-lg px-2 py-1.5 text-center">
              <div className="text-lg font-bold text-blue-700">{officerCount}</div>
              <div className="text-[10px] text-slate-600 leading-tight">{kind === "WAREHOUSE" ? "מפקדים / אחראים" : "מ״פ / רס״פ"}</div>
            </div>
            <div className="bg-emerald-50 rounded-lg px-2 py-1.5 text-center">
              <div className="text-lg font-bold text-emerald-700">{soldierCount}</div>
              <div className="text-[10px] text-slate-600 leading-tight">חיילים</div>
            </div>
          </div>

          {!row.active && <Badge className="bg-rose-100 text-rose-700 absolute top-2 right-2 text-[9px]">לא פעיל</Badge>}
        </div>

        {/* Footer מציין שאפשר ללחוץ */}
        <div className="bg-slate-50 px-4 py-1.5 text-[11px] text-slate-500 text-center border-t border-slate-100">
          לחץ לפרטים ועריכה ←
        </div>
      </div>

      {open && <HolderDetailsModal row={row} kind={kind} baseUrl={baseUrl} onClose={() => setOpen(false)} />}
    </>
  );
}

export function HolderCardGrid({ rows, kind, addButton, baseUrl = "" }: { rows: HolderRowDetail[]; kind: "WAREHOUSE" | "COMPANY"; addButton: React.ReactNode; baseUrl?: string }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {rows.map((r) => <HolderCard key={r.id} row={r} kind={kind} baseUrl={baseUrl} />)}
      {addButton}
    </div>
  );
}

// השאיפה: לשתף את הסוג עם רכיב אחר. מייצא גם export type לנוחות.
export { type HolderRowDetail };
