"use client";

import { useActionState } from "react";
import ImageUpload from "@/components/ImageUpload";
import { updateProfile, type ProfileState } from "./actions";

const initial: ProfileState = {};

type B = {
  name: string; code: string; commander: string | null; motto: string | null; notes: string | null; logoData: string | null;
};

export default function ProfileForm({ battalion }: { battalion: B }) {
  const [state, formAction, pending] = useActionState(updateProfile, initial);

  return (
    <form action={formAction} className="space-y-4">
      <ImageUpload name="logoData" initial={battalion.logoData} label="סמל הגדוד" />
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">שם הגדוד</label>
        <input name="name" defaultValue={battalion.name} required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">מפקד הגדוד</label>
          <input name="commander" defaultValue={battalion.commander ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">קוד</label>
          <input value={battalion.code} disabled
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono text-slate-400" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">משפט הגדוד</label>
        <input name="motto" defaultValue={battalion.motto ?? ""} placeholder="לנצח בכל מחיר"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">הערות</label>
        <textarea name="notes" defaultValue={battalion.notes ?? ""} rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div className="flex items-center justify-end gap-3">
        {state.ok && <span className="text-sm text-emerald-600">נשמר ✓</span>}
        {state.error && <span className="text-sm text-rose-600">{state.error}</span>}
        <button type="submit" disabled={pending}
          className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white rounded-lg px-5 py-2 text-sm font-medium">
          {pending ? "שומר..." : "שמירה"}
        </button>
      </div>
    </form>
  );
}
