"use client";

import { useActionState, useState, useTransition } from "react";
import ImageUpload from "@/components/ImageUpload";
import { updateProfile, type ProfileState } from "./actions";
import { registerTelegramWebhook } from "../counts/actions";

const initial: ProfileState = {};

type B = {
  name: string; code: string; brigade: string | null; commander: string | null; motto: string | null; notes: string | null; logoData: string | null;
  requirePersonalIdOnHandover: boolean;
  senderEmail: string | null;
  notificationEmail: string | null;
  emailToBattalion: boolean;
  telegramBotToken: string | null;
  telegramBotInfo: string | null;
};

export default function ProfileForm({ battalion }: { battalion: B }) {
  const [state, formAction, pending] = useActionState(updateProfile, initial);
  const [webhookMsg, setWebhookMsg] = useState<string | null>(null);
  const [whPending, startWhTransition] = useTransition();

  return (
    <form action={formAction} className="space-y-4">
      <ImageUpload name="logoData" initial={battalion.logoData} label="סמל הגדוד" />

      {/* 🔐 קוד גדוד להתחברות — עריך, בולט */}
      <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4">
        <h3 className="font-bold text-blue-900 flex items-center gap-2 mb-2">🔐 קוד גדוד להתחברות</h3>
        <p className="text-xs text-blue-700 mb-3">
          את הקוד הזה (או את מספר החטיבה / שם הגדוד) יש להזין במסך ה-login לצד שם משתמש וסיסמה.
          קוד גדוד חייב להיות ייחודי במערכת.
        </p>
        <input
          name="code"
          defaultValue={battalion.code}
          required
          maxLength={32}
          placeholder="5222"
          className="w-full max-w-xs bg-white border-2 border-blue-400 rounded-lg px-4 py-3 text-2xl font-mono font-bold text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-[10px] text-blue-600 mt-1">⚠️ שינוי הקוד ידרוש מכל המשתמשים בגדוד להזין את הקוד החדש בכניסה הבאה.</p>

        {/* 🔗 לינק כניסה ייחודי לגדוד */}
        <div className="mt-3 pt-3 border-t border-blue-200">
          <label className="block text-xs font-medium text-blue-800 mb-1">🔗 לינק כניסה ייחודי לגדוד</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={`${typeof window !== "undefined" ? window.location.origin : ""}/login?b=${battalion.code}`}
              className="flex-1 bg-white border border-blue-300 rounded-lg px-3 py-2 text-sm font-mono text-blue-900 select-all"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              type="button"
              onClick={() => {
                const url = `${window.location.origin}/login?b=${battalion.code}`;
                navigator.clipboard.writeText(url);
              }}
              className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-sm"
            >
              📋 העתק
            </button>
          </div>
          <p className="text-[10px] text-blue-600 mt-1">שלח לינק זה לחיילי הגדוד — הם יכנסו ישירות בלי להזין קוד גדוד, עם סמל הגדוד ברקע.</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">שם הגדוד</label>
        <input name="name" defaultValue={battalion.name} required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">מספר חטיבה (ספרות בלבד)</label>
          <input name="brigade" defaultValue={battalion.brigade ?? ""} placeholder="401"
            inputMode="numeric" pattern="\d*"
            onInput={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/\D/g, ""); }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          <p className="text-[10px] text-slate-500 mt-1">המספר משמש גם להתחברות (חלופי לקוד הגדוד)</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">מפקד הגדוד</label>
          <input name="commander" defaultValue={battalion.commander ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
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

      {/* הגדרות תפעוליות */}
      <div className="border-t border-slate-200 pt-4 mt-4">
        <h3 className="text-sm font-bold text-slate-700 mb-3">הגדרות תפעוליות</h3>
        <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-slate-50 border border-slate-200">
          <input
            type="checkbox"
            name="requirePersonalIdOnHandover"
            defaultChecked={battalion.requirePersonalIdOnHandover}
            className="mt-0.5"
          />
          <div>
            <div className="font-medium text-sm text-slate-800">חיוב מספר אישי בכל מסירה</div>
            <div className="text-xs text-slate-500 mt-0.5">
              כשמופעל — המערכת תחייב הזנת מספר אישי של מקבל המסירה בכל פעולת ניפוק/החתמה (חייל, פלוגה, חטיבה).
              מומלץ ליחידות עם רגישות בטחונית גבוהה. ברירת המחדל: לא מחייב.
            </div>
          </div>
        </label>

        {/* 📧 מייל לגיבוי תנועות */}
        <div className="mt-3 p-3 rounded-lg border border-amber-300 bg-amber-50">
          <label className="block text-sm font-medium text-slate-800 mb-1">
            📧 מייל לגיבוי תנועות <span className="text-rose-600">*</span>
          </label>
          <input
            type="email"
            name="notificationEmail"
            required
            defaultValue={battalion.notificationEmail ?? ""}
            placeholder="palmy-backup@battalion.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="text-xs text-slate-500 mt-1.5">
            כל פעולה מבצעית (חתימה, זיכוי, החתמה, מסירה, שיבוץ, שליחה לטנא) תישלח אוטומטית
            לכתובת זו עם קבצי אקסל לגיבוי. שירות המייל מתפעל ע&quot;י Resend.
          </div>
        </div>

        {/* 📤 כתובת שליחה */}
        <div className="mt-3 p-3 rounded-lg border border-slate-200">
          <label className="block text-sm font-medium text-slate-800 mb-1">
            📤 כתובת שליחה (From)
          </label>
          <input
            type="email"
            name="senderEmail"
            defaultValue={battalion.senderEmail ?? ""}
            placeholder="gadsam@palmy.co.il"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="text-xs text-slate-500 mt-1.5">
            כתובת המייל שתופיע כשולח בהתראות מהמערכת. חייבת להיות תחת דומיין מאומת.
            אם ריק — ישתמש בכתובת ברירת המחדל של המערכת.
          </div>
        </div>

        <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-slate-50 border border-slate-200 mt-3">
          <input
            type="checkbox"
            name="emailToBattalion"
            defaultChecked={battalion.emailToBattalion}
            className="mt-0.5"
          />
          <div>
            <div className="font-medium text-sm text-slate-800">שלח התראות גם למייל הגדוד</div>
            <div className="text-xs text-slate-500 mt-0.5">
              כשמופעל — מייל הגדוד למעלה יקבל העתק של כל ההתראות המבצעיות מכל המחסנים והפלוגות.
              ניתן להגדיר מיילים נפרדים בכל מחסן/פלוגה בעמוד המחסן.
            </div>
          </div>
        </label>

        {/* 🤖 טלגרם בוט */}
        <div className="mt-3 p-3 rounded-lg border border-slate-200">
          <label className="block text-sm font-medium text-slate-800 mb-1">
            🤖 טוקן בוט טלגרם
          </label>
          <input
            type="text"
            name="telegramBotToken"
            defaultValue={battalion.telegramBotToken ?? ""}
            placeholder="123456789:ABCdefGhIJKlmNOP..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
          />
          <div className="text-xs text-slate-500 mt-1.5 space-y-1">
            <p className="font-medium text-slate-600">הגדרת בוט טלגרם לאימות ציוד אוטומטי:</p>
            <ol className="list-decimal list-inside space-y-0.5 mr-1">
              <li>פתח טלגרם → חפש <b>@BotFather</b> → שלח <code className="bg-slate-100 px-1 rounded">/newbot</code></li>
              <li>בחר שם (למשל: גדסם כרמלי) ו-username ייחודי (למשל: gadsam_carmeli_bot)</li>
              <li>BotFather ישלח טוקן — העתק והדבק למעלה → <b>שמור</b></li>
              <li>לחץ &quot;חבר Webhook&quot; למטה (פעם אחת)</li>
              <li>שלח לחיילים את הלינק לבוט → הם לוחצים Start ושולחים מספר אישי</li>
            </ol>
          </div>
          {battalion.telegramBotToken && (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                disabled={whPending}
                onClick={() => {
                  setWebhookMsg(null);
                  startWhTransition(async () => {
                    const r = await registerTelegramWebhook();
                    setWebhookMsg(r.error || `Webhook רשום ✅`);
                  });
                }}
                className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg px-3 py-1.5 font-medium"
              >
                {whPending ? "מחבר..." : "🔗 חבר Webhook"}
              </button>
              {webhookMsg && (
                <span className={`text-xs ${webhookMsg.includes("✅") ? "text-emerald-600" : "text-rose-600"}`}>
                  {webhookMsg}
                </span>
              )}
            </div>
          )}
        </div>

        {/* 📋 מידע כללי לבוט */}
        {battalion.telegramBotToken && (
          <div className="mt-3 p-3 rounded-lg border border-slate-200">
            <label className="block text-sm font-medium text-slate-800 mb-1">
              📋 מידע כללי לבוט טלגרם
            </label>
            <textarea
              name="telegramBotInfo"
              defaultValue={battalion.telegramBotInfo ?? ""}
              rows={6}
              placeholder={"🍽️ ארוחות:\nבוקר: 07:00-08:00\nצהריים: 12:30-13:30\nערב: 18:00-19:00\n\n🕐 תפילות:\nשחרית: 06:15\nמנחה: לפי שקיעה\nערבית: 20:00\n\n📞 טלפונים:\nמפקד: 050-...\nסמל: 050-..."}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="text-xs text-slate-500 mt-1.5">
              טקסט חופשי שיישלח כשחייל שולח <code className="bg-slate-100 px-1 rounded">/info</code> בבוט.
              רווחי שורה נשמרים. ניתן להשתמש ב-HTML: &lt;b&gt;בולט&lt;/b&gt;
            </div>
          </div>
        )}
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
