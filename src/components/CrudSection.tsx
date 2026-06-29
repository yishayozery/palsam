"use client";

import { useState } from "react";

const EMOJI_PALETTE = [
  "🎖️", "🪖", "🚗", "🔫", "⛑️", "📡", "🛡️", "⚔️",
  "🎯", "🔧", "💣", "🏥", "📋", "🔑", "⭐", "🦺",
  "👑", "🎪", "🔥", "⚡", "🚀", "🏴", "🪂", "📦",
];

export type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "checkbox" | "select" | "emoji";
  options?: { value: string; label: string }[];
  default?: string | boolean;
};

export type Row = {
  id: string;
  values: Record<string, string | boolean>;
  display: React.ReactNode;
  locked?: boolean; // לא ניתן למחיקה (בשימוש)
};

export default function CrudSection({
  title,
  fields,
  rows,
  saveAction,
  deleteAction,
  addLabel = "הוספה",
}: {
  title: string;
  fields: Field[];
  rows: Row[];
  saveAction: (fd: FormData) => Promise<string | undefined | void>;
  deleteAction?: (fd: FormData) => Promise<void>;
  addLabel?: string;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editingRow = rows.find((r) => r.id === editId);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-slate-800">{title}</h2>
        <button
          onClick={() => {
            setAdding((v) => !v);
            setEditId(null);
          }}
          className="text-sm bg-slate-800 text-white rounded-lg px-3 py-1.5 hover:bg-slate-900"
        >
          {adding ? "ביטול" : `+ ${addLabel}`}
        </button>
      </div>

      {(adding || editingRow) && (
        <form
          action={async (fd) => {
            setError(null);
            const result = await saveAction(fd);
            if (typeof result === "string") { setError(result); return; }
            setAdding(false);
            setEditId(null);
          }}
          className="mb-4 p-3 bg-slate-50 rounded-lg flex flex-wrap items-end gap-3"
        >
          {editingRow && <input type="hidden" name="id" value={editingRow.id} />}
          {fields.map((f) => {
            const cur = editingRow?.values[f.name];
            if (f.type === "checkbox") {
              return (
                <label key={f.name} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    name={f.name}
                    defaultChecked={Boolean(cur)}
                    className="w-4 h-4"
                  />
                  {f.label}
                </label>
              );
            }
            if (f.type === "emoji") {
              return <EmojiField key={f.name} name={f.name} label={f.label} initial={String(cur ?? f.default ?? "🎖️")} />;
            }
            if (f.type === "select") {
              return (
                <div key={f.name}>
                  <label className="block text-xs text-slate-500 mb-1">{f.label}</label>
                  <select
                    name={f.name}
                    defaultValue={String(cur ?? f.default ?? "")}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  >
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }
            return (
              <div key={f.name}>
                <label className="block text-xs text-slate-500 mb-1">{f.label}</label>
                <input
                  name={f.name}
                  type={f.type || "text"}
                  defaultValue={String(cur ?? f.default ?? "")}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
            );
          })}
          <button className="bg-emerald-600 text-white rounded-lg px-4 py-1.5 text-sm hover:bg-emerald-700">
            שמירה
          </button>
          {error && (
            <p className="w-full text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mt-1">
              {error}
            </p>
          )}
        </form>
      )}

      <div className="divide-y divide-slate-100">
        {rows.length === 0 && (
          <p className="text-sm text-slate-400 py-3">אין רשומות עדיין</p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between py-2.5">
            <div className="text-sm">{r.display}</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditId(r.id);
                  setAdding(false);
                }}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                עריכה
              </button>
              {deleteAction && !r.locked && (
                <form action={deleteAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="text-xs text-rose-500 hover:text-rose-700">
                    מחיקה
                  </button>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmojiField({ name, label, initial }: { name: string; label: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-lg bg-white hover:bg-slate-50 min-w-[48px]"
      >
        {value}
      </button>
      {open && (
        <div className="absolute top-full mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg p-2 grid grid-cols-6 gap-1 w-56">
          {EMOJI_PALETTE.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => { setValue(e); setOpen(false); }}
              className={`text-xl p-1.5 rounded-lg hover:bg-slate-100 ${value === e ? "bg-blue-100 ring-2 ring-blue-400" : ""}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
