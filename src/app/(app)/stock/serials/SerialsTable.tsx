"use client";

import { useState, useMemo } from "react";
import { Card, Table, Th, Td, Badge, EmptyState } from "@/components/ui";

type Unit = {
  id: string;
  serialNumber: string;
  lotQuantity: number | null;
  itemName: string;
  sku: string | null;
  category: string | null;
  statusName: string;
  isWear: boolean;
  isLoss: boolean;
  holderName: string | null;
  signedSoldierName: string | null;
  signedSoldierPN: string | null;
};

export default function SerialsTable({ units, initialQ, initialStatus, initialSigned }: {
  units: Unit[]; initialQ: string; initialStatus: string; initialSigned: string;
}) {
  const [q, setQ] = useState(initialQ);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [signedFilter, setSignedFilter] = useState(initialSigned);

  const filtered = useMemo(() => {
    return units.filter((u) => {
      if (statusFilter === "ok" && (u.isWear || u.isLoss)) return false;
      if (statusFilter === "wear" && !u.isWear) return false;
      if (statusFilter === "loss" && !u.isLoss) return false;
      if (signedFilter === "yes" && !u.signedSoldierName) return false;
      if (signedFilter === "no" && u.signedSoldierName) return false;
      if (q.trim()) {
        const qq = q.trim().toLowerCase();
        return u.serialNumber.toLowerCase().includes(qq)
          || u.itemName.toLowerCase().includes(qq)
          || (u.sku ?? "").toLowerCase().includes(qq)
          || (u.signedSoldierName ?? "").toLowerCase().includes(qq);
      }
      return true;
    });
  }, [units, q, statusFilter, signedFilter]);

  return (
    <>
      <Card className="p-3 mb-3">
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-40">
            <label className="block text-xs text-slate-500 mb-1">חיפוש (SN / שם / מק״ט / חייל)</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="הקלד..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">סטטוס</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">הכל</option>
              <option value="ok">תקין בלבד</option>
              <option value="wear">בלאי</option>
              <option value="loss">אבוד</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">חתימה</label>
            <select value={signedFilter} onChange={(e) => setSignedFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">הכל</option>
              <option value="yes">חתום על חייל</option>
              <option value="no">לא חתום</option>
            </select>
          </div>
          <span className="text-xs text-slate-500 self-end pb-2">{filtered.length} יחידות</span>
        </div>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState>לא נמצאו יחידות תואמות</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>מס׳ סריאל</Th><Th>פריט</Th><Th>קטגוריה</Th><Th>סטטוס</Th><Th>מיקום</Th><Th>חתום על</Th></tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <Td className="font-mono">{u.serialNumber}{u.lotQuantity && <span className="text-xs text-slate-400"> ×{u.lotQuantity}</span>}</Td>
                  <Td>
                    <div className="font-medium">{u.itemName}</div>
                    {u.sku && <div className="text-xs font-mono text-slate-400">{u.sku}</div>}
                  </Td>
                  <Td className="text-xs">{u.category ?? "—"}</Td>
                  <Td>
                    <Badge className={u.isLoss ? "bg-rose-100 text-rose-700" : u.isWear ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}>
                      {u.statusName}
                    </Badge>
                  </Td>
                  <Td className="text-xs">{u.holderName ?? <span className="text-slate-300">—</span>}</Td>
                  <Td className="text-xs">
                    {u.signedSoldierName ? (
                      <span className="text-blue-600">
                        {u.signedSoldierName} {u.signedSoldierPN && <span className="font-mono text-slate-400">({u.signedSoldierPN})</span>}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
