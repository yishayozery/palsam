# PALMY — אבטחה וסקיילינג (רשימת פעולות)

מסמך תפעולי. חלק מהסעיפים כבר טופלו בקוד; החלק שדורש פעולה שלך מסומן **⚙️ פעולה נדרשת**.

---

## 1. משתני סביבה (Vercel → Settings → Environment Variables)

יש להגדיר בפרודקשן (וב-Preview אם משתמשים). ערכים חזקים (32+ תווים אקראיים).

| משתנה | תפקיד | סטטוס |
|-------|-------|-------|
| `AUTH_SECRET` | חתימת session JWT + גזירת מפתח הצפנה | **חובה** — בלעדיו האפליקציה זורקת בפרודקשן |
| `ENCRYPTION_KEY` | מפתח הצפנת סודות ב-rest (bot token, TOTP) | אופציונלי — נופל חזרה ל-`AUTH_SECRET`. **מומלץ** להגדיר ייעודי וזהה בכל הסביבות |
| `TELEGRAM_WEBHOOK_SECRET` | אימות שהבקשה לבוט באמת מטלגרם | **⚙️ פעולה** — הגדר + הרץ `scripts/set-webhook-secret.ts` |
| `CRON_SECRET` | אימות ה-crons | **חובה** — Vercel Cron שולח אותו ב-Authorization |
| `DATABASE_URL` | חיבור pooled (Neon PgBouncer) | ✅ מוגדר |
| `DIRECT_URL` | חיבור ישיר למיגרציות | ✅ מוגדר (חובר עכשיו ל-datasource) |

> ⚠️ **חשוב על מפתח ההצפנה:** מרגע שסוד נשמר מוצפן, שינוי `AUTH_SECRET`/`ENCRYPTION_KEY` → אי-אפשר לפענח את מה שנשמר. שמור גיבוי בטוח למפתח. אם משנים — צריך re-encrypt.

### פעולות חד-פעמיות אחרי הגדרת הסביבה
```bash
# 1) הצפנת סודות קיימים (חייב לרוץ עם אותו ENCRYPTION_KEY/AUTH_SECRET של הפרודקשן!)
npx tsx --env-file=.env scripts/encrypt-secrets-backfill.ts

# 2) רישום secret_token לכל בוטי הגדודים (אחרי הגדרת TELEGRAM_WEBHOOK_SECRET)
npx tsx scripts/set-webhook-secret.ts
```

---

## 2. מה כבר טופל בקוד (אבטחה)

- 🔐 **הצפנת סודות ב-rest** — `telegramBotToken` + `totpSecret` מוצפנים (AES-256-GCM), עם fallback לערכי plaintext קיימים.
- 🔐 **2FA שלב-2** — טוקן חתום קצר-מועד במקום `userId` גולמי + rate-limit per-חשבון.
- 🔐 **cron** — הסרת סוד מ-query-param (חשיפה בלוגים), השוואה בזמן-קבוע.
- 🔐 **auth-secret** — נדרש בכל סביבת דפלוי (Vercel/CI), לא רק production.
- 🔐 **בידוד holder** — משתמשי SystemRole (role legacy=VIEWER) מוגבלים ל-holder שלהם.
- 🔐 **rate-limit** — fail-closed תחת מקביליות.
- 🔐 **seed** — מנעול נגד הרצה בפרודקשן (מוחק הכל).

---

## 3. Neon (מסד נתונים) — סקיילינג לאלפי משתמשים

- ✅ **Pooled connection** — האפליקציה כבר משתמשת ב-Neon PgBouncer (`-pooler`). קריטי ל-serverless (מונע מיצוי חיבורים כשעשרות פונקציות רצות במקביל).
- **⚙️ Autoscaling compute** — ב-Neon Console → Compute: הגדל את תקרת ה-autoscaling (למשל 0.25→4 CU) כדי לספוג פסגות בימי החתמה.
- **⚙️ Scale-to-zero** — כבה בפרודקשן (אחרת הבקשה הראשונה אחרי חוסר-פעילות מקבלת cold-start של ~כמה שניות).
- **⚙️ Read replica** (Neon Pro) — לדוחות/מסכי-קריאה כבדים אפשר להפנות ל-replica ולהוריד עומס מה-primary.
- **גבולות חיבורים:** ה-pooler מטפל בזה; אין צורך ב-`connection_limit` נמוך בקוד.

---

## 4. Vercel — הגדרות

- **⚙️ Plan Pro** — נדרש: (א) יותר מ-2 crons; (ב) `maxDuration=60` שכבר בשימוש ב-cron; (ג) יותר concurrency.
- **Region** — ודא `fra1` (קרוב ל-Neon eu-central) → latency נמוך ל-DB. (כבר מוגדר.)
- **crons** — כרגע ב-`vercel.json`: counts + attendance. הגיבוי (`/api/cron/backup`) לא רשום — הוסף אותו או הרץ מתוזמן חיצוני.
- **Fluid compute / concurrency** — הפעל כדי לצמצם cold-starts.

---

## 5. הבוט — עומס של אלפי הודעות

- ✅ **throttling + backoff** — `sendTelegramBulk` שולח בקצב מבוקר (~25/שנייה, מתחת לתקרת ה-flood של טלגרם), עם טיפול ב-429/5xx/timeout. מונע חיתוך ב-maxDuration ונפילות flood-control בימי החתמה מרוכזים.
- ✅ **webhook עמיד** — כל קריאה עוברת דרך `telegramRequest` (retry/timeout).
- **⚙️ המלצה:** בימי החתמה של אלפי חיילים — עדיף להריץ ברודקאסטים גדולים מ-cron (חלון `maxDuration` ארוך) ולא מבקשת-משתמש סינכרונית.

---

## 6. אינדקסים — להרצה בחלון תעבורה נמוכה

`prisma db push` יוצר אינדקס עם נעילת-כתיבה קצרה. על טבלאות גדולות, עדיף `CREATE INDEX CONCURRENTLY` ידני (ללא נעילה) ואז `db pull`/סנכרון סכמה. הרץ ב-Neon SQL editor בחלון שקט אם מזהים איטיות בשאילתות מסוימות. אין אינדקס חסר קריטי ידוע כרגע (ה-hot paths — battalionId, status, holderId, rateLimitHit — מאונדקסים).

---

## 7. חוב מבני שנותר (מומלץ, לא דחוף)

- **data-URLs ב-DB** — תמונות/חתימות (`armoryTestProofImage`, `civilianLicense*Data`, חתימות) נשמרות כ-data-URL בטבלאות → שורות ענקיות, שאילתות איטיות, גיבוי כבד. מומלץ מעבר ל-Blob storage (Vercel Blob / S3) ושמירת URL בלבד. מיגרציה גדולה — עדיף פרויקט ייעודי.
- **`armoryTestOcrText`** — טקסט OCR של צילומי מסמכים נשמר לצמיתות. שקול מחיקה/קיצוב שמירה.
- **RBAC כפול** (legacy Role + SystemRole) — לתכנן גזירה מסודרת והסרת ה-legacy.
