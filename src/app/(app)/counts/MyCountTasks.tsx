"use client";

import { useState } from "react";
import { Card, Badge } from "@/components/ui";
import { startCountFromTask, delegateCountTask } from "./taskActions";
import { deleteCountTaskForm } from "./actions";

type Task = {
  id: string;
  shareToken: string;
  holderName: string;
  planName: string;
  status: "PENDING" | "IN_PROGRESS" | "OVERDUE" | "SCHEDULED" | "COMPLETED" | "CANCELED";
  scheduledAt: string;
  dueAt: string;
  assignedUserName: string | null;
  assignedUserId: string | null;
  sessionId: string | null;
};

type UserOption = { id: string; name: string };

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

function DelegateButton({ taskId, users, currentUserId }: { taskId: string; users: UserOption[]; currentUserId: string | null }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const others = users.filter((u) => u.id !== currentUserId);
  if (others.length === 0) return null;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className="text-xs text-violet-600 hover:text-violet-800 px-2 py-1">
        🔄 האצל
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 min-w-48 max-h-48 overflow-auto">
          {others.map((u) => (
            <form key={u.id} action={async (fd) => { setLoading(true); await delegateCountTask(fd); setOpen(false); setLoading(false); }}>
              <input type="hidden" name="taskId" value={taskId} />
              <input type="hidden" name="newUserId" value={u.id} />
              <button disabled={loading}
                className="w-full text-right px-3 py-2 text-sm hover:bg-violet-50 disabled:opacity-50 border-b border-slate-100 last:border-0">
                {u.name}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MyCountTasks({ tasks, canManage = false, users = [] }: { tasks: Task[]; canManage?: boolean; users?: UserOption[] }) {
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
              {!t.sessionId && users.length > 0 && (
                <DelegateButton taskId={t.id} users={users} currentUserId={t.assignedUserId} />
              )}
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
              {canManage && (
                <form action={deleteCountTaskForm}
                  onSubmit={(e) => { if (!confirm(`למחוק את המשימה "${t.planName}" עבור ${t.holderName}?`)) e.preventDefault(); }}>
                  <input type="hidden" name="id" value={t.id} />
                  <button title="מחק משימה זו"
                    className="bg-white border border-rose-300 text-rose-600 hover:bg-rose-50 rounded-lg px-3 py-2 text-sm">
                    🗑️
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
