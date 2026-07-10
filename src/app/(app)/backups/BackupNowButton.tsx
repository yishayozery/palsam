"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { manualBackup } from "./actions";

export default function BackupNowButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(async () => { await manualBackup(); router.refresh(); })}
      disabled={pending}
      className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
    >
      {pending ? "מגבה…" : "💾 גבה עכשיו"}
    </button>
  );
}
