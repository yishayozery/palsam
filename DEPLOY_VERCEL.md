# 🚀 פריסה ל-Vercel + Neon (חינמי)

## שלב 1: צור מסד נתונים ב-Neon

1. https://neon.tech → Sign up (GitHub)
2. "Create new project":
   - Name: `palsam-prod`
   - Postgres version: 17
   - Region: **Frankfurt (eu-central-1)**
3. אחרי יצירה, **העתק את ה-Connection String** (לחץ "Connect" → Pooled connection)
   - דוגמה: `postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`

## שלב 2: דחוף ל-GitHub

```powershell
cd C:\Users\ASUS\Desktop\GADSAM
git add -A
git commit -m "PALSAM rename + Vercel config"
# אם אין remote:
gh repo create palsam --private --source=. --push
# אם יש remote:
git push
```

## שלב 3: Vercel

1. https://vercel.com → Sign up (GitHub)
2. "Add New → Project"
3. Import את ה-repo `palsam`
4. **Settings → Environment Variables** הוסף:
   ```
   DATABASE_URL=postgresql://...?sslmode=require
   JWT_SECRET=<משהו ארוך 32+ תווים אקראיים>
   NEXT_PUBLIC_APP_URL=https://palsam.vercel.app
   CRON_SECRET=<משהו ארוך אחר 32+ תווים>
   ```
5. "Deploy"

הבילד יריץ אוטומטית `prisma migrate deploy` שיצור את הסכמה ב-Neon.

## שלב 4: Seed (פעם ראשונה בלבד)

מ-Vercel dashboard → Project → Deployments → לפתוח Terminal:
```bash
npm run db:seed
```

או מקומית עם DATABASE_URL של Neon ב-`.env`:
```powershell
$env:DATABASE_URL="postgresql://..."
npx prisma db seed
```

## ✅ פרוס

האפליקציה תהיה זמינה ב-`https://palsam.vercel.app` (או הדומיין שתבחר).

## הערות

- **Vercel Cron** רץ אוטומטית ב-`/api/cron/counts` כל 15 דקות (מוגדר ב-vercel.json)
- **Neon Free**: 500MB storage, 191.9 compute hours/month (יותר ממספיק)
- **Vercel Hobby**: ללא הגבלת זמן, אבל יש cap על bandwidth (100GB/month)

## העברת נתונים מ-Railway (אופציונלי)

אם רוצים לשמור את הנתונים מ-Railway:
1. Railway dashboard → Postgres → Connect → Postgres connection
2. `pg_dump $RAILWAY_URL > backup.sql`
3. `psql $NEON_URL < backup.sql`
