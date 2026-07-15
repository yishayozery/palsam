# PALMY — תוכנית יציאה / הגירת DB (למקרה של דרישת ריבונות-מידע בישראל)

מסמך מוכנות. **לא מבצעים עכשיו** — נשארים על Neon+Vercel עם הגנות מקסימליות.
המטרה: אם תעלה דרישה, ההעברה תהיה מהירה ובטוחה כי אין נעילת-ספק.

---

## 1. מצב הניוד — ✅ אין נעילה (נבדק 2026-07-14)

- **Postgres סטנדרטי** — אין תלות ב-`@neondatabase/serverless`, אין driver-adapter, אין extension ייחודי ל-Neon.
- **PrismaClient רגיל** מעל connection string רגיל (`DATABASE_URL` pooled + `DIRECT_URL`).
- כל התצורה דרך **env vars** — החלפת ספק = החלפת 2 מחרוזות חיבור.
- **הסודות המוצפנים ניידים**: `telegramBotToken`/`totpSecret` נשמרים כ-ciphertext בטבלה — עוברים כמו-שהם ב-dump. כל עוד `AUTH_SECRET`/`ENCRYPTION_KEY` **זהים** ביעד → מפוענחים ללא בעיה.

➡️ המשמעות: ההגירה היא `pg_dump` → `pg_restore` → החלפת env → redeploy. אין שכתוב קוד.

---

## 2. יעדים אפשריים — ספק אחד שנותן גם Hosting וגם DB בישראל

כן — יש חברות שנותנות את שניהם תחת region ישראלי אחד:

| ספק | Hosting | DB | Region ישראל |
|---|---|---|---|
| **Google Cloud** ⭐ | Cloud Run (קונטיינר) | Cloud SQL for Postgres | תל אביב (`me-west1`) |
| **AWS** | App Runner / ECS / Amplify | RDS for Postgres | תל אביב (`il-central-1`) |
| **Oracle Cloud** | OCI Container Instances | OCI Postgres | ירושלים |

**המלצה אם/כשנעבור: Google Cloud (הכל ב-`me-west1`).** יתרון: ה-app וה-DB באותו datacenter → latency מינימלי (בניגוד למצב היום שבו Vercel בפרנקפורט וה-DB אצל Neon). ריבונות מלאה + ביצועים, בספק בינלאומי רציני.

> הערה: Vercel עצמו מציע Postgres (מבוסס Neon) — אבל **אין לו region ישראלי**, אז זה לא פותר את הדרישה.

---

## 3. מה המשמעות של המעבר (מאמץ וזמן-השבתה)

**מאמץ:** בינוני, לא גדול — בזכות אפס-נעילה. עיקר העבודה היא הגדרת הענן החדש (חשבון, רשת, הרשאות), לא קוד.

**זמן השבתה:** מינימלי (~10-30 דק') אם עושים נכון — dump/restore בחלון שקט + החלפת env + redeploy. אפשר לרדת לכמעט-אפס עם replication, אבל לגודל שלנו dump/restore בחלון לילי מספיק.

**סיכונים עיקריים:** (א) לוודא שאותו `AUTH_SECRET`/`ENCRYPTION_KEY` עובר — אחרת הסודות המוצפנים לא יפוענחו; (ב) latency אם ה-app וה-DB לא באותו region; (ג) עדכון ה-webhooks של הבוטים אם הדומיין משתנה.

---

## 4. Runbook — צעד-צעד (כשנחליט לבצע)

```bash
# 0) חלון תחזוקה שקט (לילה). הקפאת כתיבות אם אפשר.

# 1) גיבוי מלא מ-Neon (דרך DIRECT_URL — לא pooled)
pg_dump "$DIRECT_URL" -Fc -f palmy-$(date +%Y%m%d).dump

# 2) יצירת instance ביעד (Google Cloud SQL, me-west1, Postgres 16, עם pooler)
#    → מקבלים DATABASE_URL_NEW (pooled) + DIRECT_URL_NEW

# 3) שחזור
pg_restore --no-owner --no-privileges -d "$DIRECT_URL_NEW" palmy-YYYYMMDD.dump

# 4) אימות ספירות (טבלאות קריטיות תואמות)
psql "$DIRECT_URL_NEW" -c "select count(*) from \"Soldier\";  select count(*) from \"SerialUnit\"; select count(*) from \"Signature\";"

# 5) החלפת env בסביבת ה-hosting (Vercel/Cloud Run):
#    DATABASE_URL = <pooled החדש>   DIRECT_URL = <direct החדש>
#    ⚠️ AUTH_SECRET / ENCRYPTION_KEY — זהים לישנים (אחרת סודות מוצפנים לא יפוענחו)
#    CRON_SECRET / TELEGRAM_WEBHOOK_SECRET — להעביר כמו-שהם

# 6) redeploy + עשן: התחברות, שאילתה, שליחת הודעת בוט אחת.

# 7) אם הדומיין השתנה: להריץ מחדש scripts/set-webhook-secret.ts (מרשם webhook חדש).

# 8) לשמור את Neon פעיל 48-72 ש' כ-rollback לפני מחיקה.
```

---

## 5. מה לשמור "מוכן" כדי שההעברה תהיה מהירה

- ✅ **אפס נעילת-ספק** (מתוחזק — לא להוסיף Neon-serverless driver / extensions ייחודיים).
- ✅ **`directUrl` מוגדר** (חובר ל-datasource) — הכרחי ל-dump/restore נקי.
- ✅ **סודות מוצפנים ניידים** — לתעד היטב את מיקום המפתח (`AUTH_SECRET`/`ENCRYPTION_KEY`) ולגבותו בטוח.
- 🔲 **גיבוי חיצוני תקופתי** (cron-job.org → `/api/cron/backup`) — כך שתמיד יש snapshot עדכני לשחזור מהיר.
- 🔲 להריץ `pg_dump` ניסיוני פעם אחת עכשיו כ-drill (לוודא שהפקודה עוברת) — אופציונלי.
