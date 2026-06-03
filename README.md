# מערכת ניהול שרשרת אספקה, מלאי והחתמות ציוד — דרג גדודי

מערכת Web (RTL, עברית) לניהול מחזור החיים המלא של ציוד צבאי/לוגיסטי בדרג הגדודי:
קליטה, הקצאה, מעקב, החתמה, זיכוי, ספירות וניהול פערים.

**ארכיטקטורה:** Next.js 16 (App Router) · PostgreSQL · Prisma · Tailwind · Auth מבוסס session (RBAC).
גישת **Multi-Instance** — קוד בסיס אחד; כל גדוד מקבל קונטיינר ומסד נתונים מבודד.

## מודולים

| מודול | תיאור |
|-------|--------|
| מילונים | קטגוריות, סטטוסים, תדירויות, מבנה ארגוני — Admin-driven, ללא Hardcoding |
| קטלוג | מק"טים ב-4 שיטות: כמותי / פרטני (S/N) / אצווה (Lot) / ערכה (Kit) |
| מלאי | תמונת מלאי לפי מחזיק, קליטה וגריעה מול החטיבה |
| העברות + לחיצת יד | הקצאה "מלאי במעבר" עם אישור דו-צדדי, החזרה עם סטטוס, תעודות PDF |
| החתמות | החתמת חיילים ב-QR/וואטסאפ/שרבוט, זיכוי מהיר, אחריות מול מיקום |
| ספירות + פערים | ספירת מחסן/פלוגתית/רוחבית (הקפאת מצב), פערים לאישור Admin |
| דשבורד + דוחות | אמינות מלאי, תמונת מצב פלוגתית, חתכים, ייצוא Excel, Audit Log |

## הרשאות (RBAC)

`ADMIN` · `LOGISTICS` (קל"ג) · `COMPANY_SP` (רס"פ) · `ARMORY` (נשקייה) · `VIEWER` (מבקר/מג"ד)

## הרצה — סביבת פיתוח

### אפשרות א': Docker (מומלץ לפרודקשן / Multi-Instance)

```bash
docker compose up -d        # מריץ Postgres מבודד
npm install
npm run db:migrate          # יוצר סכמה
npm run db:seed             # נתוני דמו
npm run dev
```

### אפשרות ב': Postgres מקומי (אם Docker לא זמין)

ודא ש-Postgres מאזין על `localhost:5432` עם המשתמש/סיסמה/DB שב-`.env`, ואז:

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

פתח http://localhost:3000

## משתמשי דמו (סיסמה לכולם: `123456`)

`admin` · `klag` · `raspa` · `raspb` · `armory` · `magad`

## פריסת Multi-Instance (לכל גדוד)

העתק את `docker-compose.yml` עם שמות/פורטים/סיסמאות ייחודיים, עדכן `UNIT_NAME`/`UNIT_CODE`
ו-`DATABASE_URL` ב-`.env` של אותו מופע. עדכוני גרסה נדחפים לכל הקונטיינרים במקביל (CI/CD).

## הערה — Docker Desktop

אם Docker Desktop קורס באתחול (`initializing Inference manager`), זהו באג ידוע ברכיב ה-Model Runner
של גרסאות חדשות. פתרון: עדכון/הורדת גרסת Docker Desktop, או השבתת *Docker Model Runner*
בהגדרות. בסביבת הפיתוח כאן נעשה שימוש ב-Postgres מקומי לעקיפת הבעיה.
