"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { submitQuestion, answerQuestion, deleteQuestion, saveSupportConfig } from "./actions";

type Q = { id: string; category: string | null; question: string; status: string; answer: string | null; askedByName: string; createdAt: string };

const CATS = ["שאלה", "תקלה", "צורך/בקשה"];

export default function SupportClient({ isAdmin, isSuperAdmin, waLink, config, questions }: {
  isAdmin: boolean; isSuperAdmin: boolean; waLink: string | null;
  config: { enabled: boolean; number: string; message: string };
  questions: Q[];
}) {
  const [answering, setAnswering] = useState<string | null>(null);
  const open = questions.filter((q) => q.status === "OPEN");
  const answered = questions.filter((q) => q.status === "ANSWERED");

  return (
    <div className="space-y-4">
      {/* כפתור ווטסאפ */}
      {waLink && (
        <a href={waLink} target="_blank" rel="noreferrer"
          className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl py-3 font-bold text-sm">
          💬 עזרה מהירה בוואטסאפ
        </a>
      )}

      {/* אדמין-על — הגדרת ווטסאפ */}
      {isSuperAdmin && (
        <Card className="p-4 bg-amber-50 border-amber-200">
          <h3 className="font-bold text-amber-900 text-sm mb-2">⚙️ הגדרת כפתור ווטסאפ (אדמין-על, גלובלי)</h3>
          <form action={saveSupportConfig} className="space-y-2">
            <input name="supportWhatsappNumber" defaultValue={config.number} placeholder="מספר בינ״ל ללא + (למשל 972501234567)"
              className="w-full rounded-lg border border-amber-300 px-3 py-2 text-sm" />
            <input name="supportMessage" defaultValue={config.message} placeholder="טקסט פתיחה (אופציונלי)"
              className="w-full rounded-lg border border-amber-300 px-3 py-2 text-sm" />
            <button className="bg-amber-700 hover:bg-amber-800 text-white rounded-lg px-4 py-2 text-sm font-medium">💾 שמור</button>
            <p className="text-[11px] text-amber-700">💡 יש מספר → הכפתור מופיע לכל המפקדים. ריק → אין תמיכת ווטסאפ.</p>
          </form>
        </Card>
      )}

      {/* טופס העלאת שאלה */}
      <Card className="p-4">
        <h3 className="font-bold text-slate-700 text-sm mb-2">📝 העלה שאלה / תקלה / צורך</h3>
        <form action={submitQuestion} className="space-y-2">
          <div className="flex gap-2">
            <select name="category" className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <textarea name="question" required rows={2} placeholder="מה השאלה / התקלה / הצורך?"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-5 py-2 text-sm font-medium">שלח</button>
        </form>
      </Card>

      {/* פתוחות */}
      {open.length > 0 && (
        <div>
          <h3 className="font-bold text-slate-700 text-sm mb-2">🟡 פתוחות {isAdmin ? `(${open.length})` : ""}</h3>
          <div className="space-y-2">
            {open.map((q) => (
              <Card key={q.id} className="p-3 bg-amber-50/50 border-amber-200">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-400">{q.category} · {q.askedByName} · {new Date(q.createdAt).toLocaleDateString("he-IL")}</div>
                    <div className="text-sm text-slate-800">{q.question}</div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => setAnswering(answering === q.id ? null : q.id)} className="text-xs text-blue-600 hover:underline">ענה</button>
                      <form action={deleteQuestion}><input type="hidden" name="id" value={q.id} /><button className="text-xs text-rose-400">🗑️</button></form>
                    </div>
                  )}
                </div>
                {isAdmin && answering === q.id && (
                  <form action={answerQuestion} className="mt-2 flex items-center gap-1.5" onSubmit={() => setAnswering(null)}>
                    <input type="hidden" name="id" value={q.id} />
                    <input name="answer" required autoFocus placeholder="התשובה..." className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                    <button className="text-xs bg-emerald-600 text-white rounded px-3 py-1.5">שלח תשובה</button>
                  </form>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* נענו */}
      {answered.length > 0 && (
        <div>
          <h3 className="font-bold text-slate-700 text-sm mb-2">✅ נענו</h3>
          <div className="space-y-2">
            {answered.map((q) => (
              <Card key={q.id} className="p-3">
                <div className="text-[11px] text-slate-400">{q.category} · {q.askedByName}</div>
                <div className="text-sm text-slate-800">{q.question}</div>
                <div className="text-sm text-emerald-700 mt-1 pr-2 border-r-2 border-emerald-300">💬 {q.answer}</div>
                {isAdmin && <form action={deleteQuestion} className="mt-1"><input type="hidden" name="id" value={q.id} /><button className="text-[11px] text-rose-400">מחק</button></form>}
              </Card>
            ))}
          </div>
        </div>
      )}

      {questions.length === 0 && (
        <Card className="p-6 text-center text-slate-400 text-sm">אין שאלות עדיין. תמיד אפשר להעלות שאלה או צורך למעלה.</Card>
      )}
    </div>
  );
}
