"use client";

import { useState } from "react";
import { Card, Badge } from "@/components/ui";
import { startCountFromTask } from "./taskActions";

type Task = {
  id: string;
  shareToken: string;
  holderName: string;
  planName: string;
  status: "PENDING" | "IN_PROGRESS" | "OVERDUE" | "SCHEDULED" | "COMPLETED" | "CANCELED";
  scheduledAt: string;
  dueAt: string;
  assignedUserName: string | null;
  sessionId: string | null;
};

function fmt(dt: string) {
  const d = new Date(dt);
  return d.toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function statusBadge(s: Task["status"]) {
  if (s === "OVERDUE") return <Badge className="bg-rose-100 text-rose-800">⏰ באיחור</Badge>;
  if (s === "IN_PROGRESS") return <Badge className="bg-amber-100 text-amber-800">בביצוע</Badge>;
  if (s === "PENDING") return <Badge className="bg-blue-100 text-blue-800">פתוח</Badge>;
  if (s === "COMPLETED") return <Badge className="bg-emerald-100 text-emerald-800">הושלם</Badge>;
  return <Badge>{s}</Badge>;
}

function ShareButton({ shareToken, holderName }: { shareToken: string; holderName: string }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/counts/share/${shareToken}` : "";
  const message = `שלום, יש לבצע ספירת מלאי עבור ${holderName}. נא להיכנס לקישור ולמלא: ${link}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(message)}`;
  return (
    <div className="flex items-center gap-1.5">
      <button type="button"
        onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1">
        {copied ? "✓ הועתק" : "📋 העתק לינק"}
      </button>
      <a href={wa} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 hover:text-emerald-800 px-2 py-1">
        📱 WhatsApp
      </a>
    </div>
  );
}

export default function MyCountTasks({ tasks }: { tasks: Task[] }) {
  const overdue = tasks.filter((t) => t.status === "OVERDUE");
  return (
    <div className="space-y-3 mb-6">
      <div className="flex items-center gap-2">
        <h2 className="font-bold text-slate-800">המשימות שלך ({tasks.length})</h2>
        {overdue.length > 0 && (
          <Badge className="bg-rose-100 text-rose-700">⚠️ {overdue.length} באיחור</Badge>
        )}
      </div>

      {tasks.map((t) => (
        <Card key={t.id} className={`p-4 ${t.status === "OVERDUE" ? "border-rose-300 bg-rose-50" : "border-slate-200"}`}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-48">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-bold text-slate-800">{t.planName}</span>
                {statusBadge(t.status)}
              </div>
              <div className="text-sm text-slate-600">
                📍 <b>{t.holderName}</b>
                {t.assignedUserName && <span className="text-xs text-slate-400 mr-2">· אחראי: {t.assignedUserName}</span>}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                מתוזמן: {fmt(t.scheduledAt)} · עד: {fmt(t.dueAt)}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <ShareButton shareToken={t.shareToken} holderName={t.holderName} />
              {t.sessionId ? (
                <a href={`/counts/${t.sessionId}`}
                  className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-4 py-2 text-sm font-medium">
                  המשך ספירה
                </a>
              ) : (
                <form action={startCountFromTask}>
                  <input type="hidden" name="taskId" value={t.id} />
                  <button className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium">
                    ▶ התחל ספירה
                  </button>
                </form>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
