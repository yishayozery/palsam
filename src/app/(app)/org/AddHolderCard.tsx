"use client";

import { useState } from "react";
import { WAREHOUSE_TYPE_SHORT } from "@/lib/rbac";
import type { WarehouseType } from "@/generated/prisma";
import { createWarehouse, createCompany } from "./actions";

const WH_OPTS: WarehouseType[] = ["EQUIPMENT", "COMMS", "AMMO", "ARMORY", "VEHICLES", "MEDICAL", "GENERAL"];

export default function AddHolderCard({ kind }: { kind: "WAREHOUSE" | "COMPANY" }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [warehouseType, setWarehouseType] = useState<WarehouseType>("EQUIPMENT");
  const action = kind === "WAREHOUSE" ? createWarehouse : createCompany;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="bg-white border-2 border-dashed border-slate-300 rounded-2xl hover:bg-slate-50 hover:border-slate-400 transition flex flex-col items-center justify-center text-slate-500 hover:text-slate-700 min-h-[140px]">
        <span className="text-4xl mb-1">+</span>
        <span className="text-sm font-medium">{kind === "WAREHOUSE" ? "מחסן חדש" : "פלוגה חדשה"}</span>
      </button>
    );
  }

  return (
    <form action={async (fd) => { await action(fd); setOpen(false); setName(""); }}
      className="bg-white border-2 border-slate-300 rounded-2xl p-3 flex flex-col gap-2 min-h-[140px]">
      <div className="text-xs font-bold text-slate-700">{kind === "WAREHOUSE" ? "מחסן חדש" : "פלוגה חדשה"}</div>
      <input value={name} onChange={(e) => setName(e.target.value)} name="name" required autoFocus
        placeholder={kind === "WAREHOUSE" ? "שם המחסן" : "שם הפלוגה"}
        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      {kind === "WAREHOUSE" && (
        <select name="warehouseType" value={warehouseType} onChange={(e) => setWarehouseType(e.target.value as WarehouseType)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          {WH_OPTS.map((v) => <option key={v} value={v}>{WAREHOUSE_TYPE_SHORT[v]}</option>)}
        </select>
      )}
      <div className="flex gap-2 mt-auto">
        <button type="button" onClick={() => setOpen(false)} className="flex-1 text-xs border border-slate-300 rounded-lg py-1.5 hover:bg-slate-50">ביטול</button>
        <button className="flex-1 text-xs bg-slate-800 text-white rounded-lg py-1.5 hover:bg-slate-900">הוסף</button>
      </div>
    </form>
  );
}
