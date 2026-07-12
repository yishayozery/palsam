"use client";

import { useState, useMemo } from "react";
import { Card, Badge, Table, Th, Td, EmptyState } from "@/components/ui";
import IneligibilityActions from "./IneligibilityActions";

type Row = {
  id: string; name: string; pn: string | null; phone: string | null;
  company: string; enlisted: boolean; approved: boolean; test: boolean;
  testVerified: boolean | null; agreement: boolean; missing: string[]; isFullyEligible: boolean;
  weaponsCount: number;
};

export default function IneligibilityTable({ rows, armoryTestUrl }: { rows: Row[]; armoryTestUrl: string | null }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "eligible" | "ineligible">("all");

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === "eligible" && !r.isFullyEligible) return false;
      if (filter === "ineligible" && r.isFullyEligible) return false;
      if (q.trim()) {
        const s = q.trim().toLowerCase();
        return r.name.toLowerCase().includes(s) || (r.pn ?? "").includes(s) || r.company.toLowerCase().includes(s);
      }
      return true;
    });
  }, [rows, q, filter]);

  const eligible = rows.filter((r) => r.isFullyEligible).length;
  const ineligible = rows.length - eligible;

  return (
    <>
      <Card className="p-3 mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 חיפוש — שם / מ.א. / פלוגה"
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm mb-2" />
        <div className="flex gap-1.5 flex-wrap text-xs">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            הכל ({rows.length})
          </FilterChip>
          <FilterChip active={filter === "eligible"} onClick={() => setFilter("eligible")} color="emerald">
            ✅ זכאים ({eligible})
          </FilterChip>
          <FilterChip active={filter === "ineligible"} onClick={() => setFilter("ineligible")} color="rose">
            ❌ לא זכאים ({ineligible})
          </FilterChip>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-6"><EmptyState>אין חיילים תואמים</EmptyState></Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>חייל</Th><Th>פלוגה</Th>
                <Th>שלישות</Th><Th>אישור נשק-גדודי</Th><Th>מבחן ארמון</Th><Th>נוהל שמירה</Th>
                <Th>סטטוס</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className={r.isFullyEligible ? "" : "bg-rose-50/30"}>
                  <Td>
                    <div className="font-medium">{r.name}</div>
                    {r.pn && <div className="text-[11px] text-slate-500 font-mono">{r.pn}</div>}
                    {r.weaponsCount > 0 && (
                      <div className="text-[10px] text-blue-600 mt-0.5">🔫 {r.weaponsCount} פריטי נשק חתומים</div>
                    )}
                  </Td>
                  <Td className="text-xs">{r.company}</Td>
                  <Td>{r.enlisted ? "✅" : "❌"}</Td>
                  <Td>{r.approved ? "✅" : "❌"}</Td>
                  <Td>
                    {r.test ? "✅" : "❌"}
                    {r.test && (
                      <span className="block text-[10px]" title={r.testVerified === true ? "מ\"א אומת ב-OCR" : r.testVerified === false ? "לא זוהתה התאמה — דרוש אימות ידני" : "טרם אומת — לחץ 'צפה' להרצת אימות"}>
                        {r.testVerified === true ? "🟢 אומת" : r.testVerified === false ? "🟡 דרוש אימות" : "⚪ לא נבדק"}
                      </span>
                    )}
                    {r.test && (
                      <a href={`/weapons-agreement/${r.id}?tab=test`} target="_blank" rel="noopener noreferrer"
                        className="block text-[10px] text-blue-600 hover:underline">צפה / אמת</a>
                    )}
                    {!r.test && armoryTestUrl && (
                      <a href={armoryTestUrl} target="_blank" rel="noopener noreferrer"
                        className="block text-[10px] text-blue-600 hover:underline">קישור למבחן</a>
                    )}
                  </Td>
                  <Td>
                    {r.agreement ? "✅" : "❌"}
                    {r.agreement && (
                      <a href={`/weapons-agreement/${r.id}`} target="_blank" rel="noopener noreferrer"
                        className="block text-[10px] text-blue-600 hover:underline">צפה בנוהל</a>
                    )}
                  </Td>
                  <Td>
                    {r.isFullyEligible ? (
                      <Badge className="bg-emerald-100 text-emerald-700">✓ זכאי</Badge>
                    ) : (
                      <Badge className="bg-rose-100 text-rose-700">✗ לא זכאי</Badge>
                    )}
                  </Td>
                  <Td>
                    {!r.isFullyEligible && r.phone && r.approved && !r.test && (
                      <IneligibilityActions soldierName={r.name} phone={r.phone} armoryTestUrl={armoryTestUrl} />
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}

function FilterChip({ children, active, onClick, color = "slate" }: {
  children: React.ReactNode; active: boolean; onClick: () => void;
  color?: "slate" | "emerald" | "rose";
}) {
  const map = {
    slate: active ? "bg-slate-800 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700",
    emerald: active ? "bg-emerald-700 text-white" : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200",
    rose: active ? "bg-rose-700 text-white" : "bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200",
  };
  return <button onClick={onClick} className={`rounded-full px-3 py-1 ${map[color]}`}>{children}</button>;
}
