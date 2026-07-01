"use client";

import { useActionState, useState, useTransition } from "react";
import { updateOperationalSettings, type OpsState } from "./actions";
import { registerTelegramWebhook } from "../counts/actions";

const initial: OpsState = {};

type Props = {
  battalion: {
    requirePersonalIdOnHandover: boolean;
    senderEmail: string | null;
    notificationEmail: string | null;
    emailToBattalion: boolean;
    telegramBotToken: string | null;
    telegramBotInfo: string | null;
    telegramBotUsername: string | null;
  };
};

export default function OperationalSettingsForm({ battalion }: Props) {
  const [state, formAction, pending] = useActionState(updateOperationalSettings, initial);
  const [webhookMsg, setWebhookMsg] = useState<string | null>(null);
  const [whPending, startWhTransition] = useTransition();
  const [botUsername, setBotUsername] = useState(battalion.telegramBotUsername);

  const botLink = botUsername ? `https://t.me/${botUsername}` : null;

  return (
    <form action={formAction} className="space-y-4">
      <h3 className="text-sm font-bold text-slate-700 mb-3">הגדרות תפעוליות</h3>

      {/* חיוב מספר אישי */}
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
      <div className="p-3 rounded-lg border border-amber-300 bg-amber-50">
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
      <div className="p-3 rounded-lg border border-slate-200">
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

      <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-slate-50 border border-slate-200">
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
      <div className="p-3 rounded-lg border border-slate-200">
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
                  if (r.error) {
                    setWebhookMsg(r.error);
                  } else {
                    setWebhookMsg("Webhook רשום ✅");
                    if (r.botUsername) setBotUsername(r.botUsername);
                  }
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

      {/* 🔗 לינק לבוט */}
      {botLink && (
        <div className="p-3 rounded-lg border border-blue-200 bg-blue-50">
          <label className="block text-sm font-medium text-blue-800 mb-1">🔗 לינק לבוט טלגרם</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={botLink}
              className="flex-1 bg-white border border-blue-300 rounded-lg px-3 py-2 text-sm font-mono text-blue-900 select-all"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(botLink)}
              className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-sm"
            >
              📋 העתק
            </button>
          </div>
          <p className="text-[10px] text-blue-600 mt-1">שלח לינק זה לחיילים — הם לוחצים Start ושולחים את המספר האישי.</p>
        </div>
      )}

      {/* 📋 מידע כללי לבוט */}
      {battalion.telegramBotToken && (
        <div className="p-3 rounded-lg border border-slate-200">
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
