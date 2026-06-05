import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * עמוד שיתוף לספירה — נפתח דרך WhatsApp עם token. אם הוא יש session — מפנה אליו.
 * אם אין — מציג מסך פתיחה שמסביר שצריך התחברות לביצוע.
 */
export default async function SharedCountPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const task = await prisma.countTask.findUnique({
    where: { shareToken: token },
    include: { holder: true, plan: true, battalion: { select: { name: true } } },
  });

  if (!task) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6" dir="rtl">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-rose-600 mb-2">לינק לא תקין</h1>
          <p className="text-slate-600">לינק הספירה לא נמצא או שפג תוקפו.</p>
        </div>
      </div>
    );
  }

  // אם יש סשן פעיל — נדרשת התחברות כדי להמשיך
  if (task.sessionId) {
    redirect(`/login?next=/counts/${task.sessionId}`);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6" dir="rtl">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">🔢</div>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">משימת ספירת מלאי</h1>
          <p className="text-sm text-slate-500">{task.battalion.name}</p>
        </div>

        <div className="space-y-3 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="text-xs text-blue-700 mb-1">תכנית</div>
            <div className="font-bold text-slate-800">{task.plan?.name ?? "ספירה ידנית"}</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="text-xs text-amber-800 mb-1">מקום</div>
            <div className="font-bold text-slate-800">📍 {task.holder.name}</div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm">
            <div className="text-slate-500">מתוזמן: {task.scheduledAt.toLocaleString("he-IL")}</div>
            <div className="text-slate-500">עד: {task.dueAt.toLocaleString("he-IL")}</div>
          </div>
        </div>

        <a href={`/login?next=/counts/share/${token}/start`}
          className="block w-full bg-slate-800 hover:bg-slate-900 text-white text-center rounded-lg py-3 font-bold">
          התחבר וביצוע ספירה
        </a>

        <p className="text-xs text-slate-400 text-center mt-4">
          כדי לבצע ספירה דרושה התחברות. אם אין לך משתמש — פנה לאחראי שהעביר לך את הלינק.
        </p>
      </div>
    </div>
  );
}
