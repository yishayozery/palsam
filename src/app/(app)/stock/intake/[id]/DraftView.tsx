"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Badge, Table, Th, Td } from "@/components/ui";
import { createMissingItems, approveIntake, updateDraftLine, deleteDraftLine, cancelDraft } from "../actions";

type Line = {
  id: string; sku: string; description: string; standardQty: number; allocatedQty: number;
  gap: number; editedByUser: boolean; liveStatus: string; liveNote: string | null;
};

const STATUS: Record<string, { label: string; row: string; badge: string }> = {
  OK: { label: "תקין", row: "", badge: "bg-emerald-100 text-emerald-700" },
  UNKNOWN_SKU: { label: "מק\"ט חדש", row: "bg-sky-50", badge: "bg-sky-100 text-sky-700" },
  CHECKSUM_MISMATCH: { label: "החשבון לא מסתדר", row: "bg-rose-50", badge: "bg-rose-100 text-rose-700" },
  SERIAL_BLOCKED: { label: "סריאלי — חסום", row: "bg-amber-50", badge: "bg-amber-100 text-amber-700" },
  ZERO_QTY: { label: "כמות 0", row: "opacity-50", badge: "bg-slate-100 text-slate-500" },
};

export default function DraftView({
  draftId, status, transferId, lines, ready, blocking, unknownCount,
}: {
  draftId: string; status: string; transferId: string | null; lines: Line[];
  ready: boolean; blocking: Record<string, number>; unknownCount: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const approved = status !== "DRAFT";

  function run(fn: () => Promise<{ error?: string } | void>, ok?: () => void) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res && "error" in res && res.error) { setError(res.error); return; }
      ok?.();
      router.refresh();
    });
  }

  if (approved) {
    return (
      <Card className="p-4">
        <div className="text-emerald-700 font-bold mb-2">
          {status === "APPROVED" ? "✅ הקליטה אושרה — המלאי עודכן" : "הטיוטה בוטלה"}
        </div>
        {transferId && <div className="text-sm text-slate-500">תעודת קליטה: {transferId}</div>}
        <LineTable lines={lines} readOnly />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* פס שערים */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-700">שער 1 — הקמת פריטים חסרים</div>
            <div className="text-xs text-slate-500">{unknownCount > 0 ? `${unknownCount} מק"טים לא בקטלוג` : "אין פריטים חסרים ✓"}</div>
          </div>
          <Button
            onClick={() => run(() => createMissingItems(fd({ draftId })))}
            disabled={pending || unknownCount === 0}
          >
            {pending ? "…" : `הקם ${unknownCount || ""} פריטים (ציוד / כמותי)`}
          </Button>
        </div>
        <div className="border-t my-3" />
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-700">שער 2 — אישור קליטה למלאי</div>
            <div className="text-xs text-slate-500">
              {ready ? "כל השורות תקינות ✓" : `חסום: ${Object.entries(blocking).map(([k, n]) => `${STATUS[k]?.label ?? k} (${n})`).join(", ")}`}
            </div>
          </div>
          <Button
            onClick={() => run(() => approveIntake(fd({ draftId })), () => router.push("/stock"))}
            disabled={pending || !ready}
            className={ready ? "bg-emerald-600 hover:bg-emerald-700" : ""}
          >
            {pending ? "…" : "אשר וקלוט למלאי"}
          </Button>
        </div>
      </Card>

      {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">{error}</div>}

      <Card className="p-0 overflow-x-auto">
        <LineTable lines={lines} editId={editId} setEditId={setEditId} onSave={(fd2) => run(() => updateDraftLine(fd2), () => setEditId(null))} onDelete={(id) => run(() => deleteDraftLine(fd({ lineId: id })))} pending={pending} />
      </Card>

      <button
        onClick={() => run(() => cancelDraft(fd({ draftId })), () => router.push("/stock/intake"))}
        className="text-xs text-rose-500 hover:underline"
        disabled={pending}
      >
        בטל טיוטה
      </button>
    </div>
  );
}

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

function LineTable({
  lines, readOnly, editId, setEditId, onSave, onDelete, pending,
}: {
  lines: Line[]; readOnly?: boolean; editId?: string | null;
  setEditId?: (id: string | null) => void; onSave?: (fd: FormData) => void;
  onDelete?: (id: string) => void; pending?: boolean;
}) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>מצב</Th><Th>מק&quot;ט</Th><Th>תיאור</Th><Th>תקן</Th><Th>מלאי</Th><Th>פער</Th>
          {!readOnly && <Th></Th>}
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => {
          const st = STATUS[l.liveStatus] ?? STATUS.OK;
          if (editId === l.id && !readOnly) {
            return (
              <tr key={l.id} className="bg-indigo-50 border-b">
                <td colSpan={7} className="px-2 md:px-4 py-2.5">
                  <form
                    action={(f) => { f.set("lineId", l.id); onSave?.(f); }}
                    className="flex flex-wrap gap-2 items-end"
                  >
                    <input name="sku" defaultValue={l.sku} className="w-28 rounded border px-2 py-1 text-sm" placeholder="מק&quot;ט" />
                    <input name="description" defaultValue={l.description} className="flex-1 min-w-[120px] rounded border px-2 py-1 text-sm" placeholder="תיאור" />
                    <input name="standardQty" type="number" defaultValue={l.standardQty} className="w-16 rounded border px-2 py-1 text-sm" placeholder="תקן" />
                    <input name="allocatedQty" type="number" defaultValue={l.allocatedQty} className="w-16 rounded border px-2 py-1 text-sm" placeholder="מלאי" />
                    <Button type="submit" disabled={pending}>שמור</Button>
                    <button type="button" onClick={() => setEditId?.(null)} className="text-xs text-slate-500">בטל</button>
                  </form>
                </td>
              </tr>
            );
          }
          return (
            <tr key={l.id} className={`border-b last:border-0 ${st.row}`}>
              <Td className="whitespace-nowrap">
                <Badge className={st.badge}>{st.label}</Badge>
                {l.editedByUser && <span title="תוקן ידנית" className="mr-1 text-xs text-slate-400">✎</span>}
              </Td>
              <Td className="font-mono text-xs">{l.sku}</Td>
              <Td className="text-sm">
                {l.description}
                {l.liveNote && <div className="text-xs text-slate-400">{l.liveNote}</div>}
              </Td>
              <Td>{l.standardQty}</Td>
              <Td className="font-semibold">{l.allocatedQty}</Td>
              <Td className={l.standardQty - l.allocatedQty !== l.gap ? "text-rose-600 font-bold" : ""}>{l.gap}</Td>
              {!readOnly && (
                <Td className="whitespace-nowrap">
                  <button onClick={() => setEditId?.(l.id)} className="text-xs text-indigo-600 hover:underline">ערוך</button>
                  <button onClick={() => onDelete?.(l.id)} className="text-xs text-rose-500 hover:underline mr-2" disabled={pending}>מחק</button>
                </Td>
              )}
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
