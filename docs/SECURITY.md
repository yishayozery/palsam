# 🛡️ אבטחת המערכת — מדריך הפעלה

מסמך זה מסכם את שכבות ההגנה החינמיות במערכת ואיך להפעיל אותן.

## ✅ מה כבר מוטמע בקוד

| שכבה | מה זה | קובץ |
|---|---|---|
| **Security Headers** | HSTS, CSP, X-Frame-Options, etc. | `next.config.ts` |
| **Rate Limiting** | 5 ניסיונות login לכל IP ב-15 דק' | `src/lib/rate-limit.ts` |
| **Bcrypt password hashing** | סיסמאות לא בטקסט פתוח | `src/lib/auth.ts` |
| **JWT עם expiration** | קוקי 12 שעות, httpOnly, secure | `src/lib/auth.ts` |
| **Multi-tenant scoping** | כל query מסונן ב-battalionId | כל ה-pages |
| **Audit log** | כל פעולה רשומה | `src/lib/audit.ts` |
| **גיבוי שבועי** | יום שישי 02:00 UTC | `.github/workflows/db-backup.yml` |

## 🚧 מה אתה צריך להפעיל ידנית

### 1. Cloudflare Free Plan (15 דקות, חינם לחלוטין)

#### שלב 1: הרשמה
1. היכנס ל-https://dash.cloudflare.com/sign-up
2. הרשם עם מייל אישי או של היחידה
3. הזן את הדומיין של האתר (לדוגמה: `palsam.co.il`)
4. בחר **Free Plan**

#### שלב 2: שינוי DNS
Cloudflare ייתן שני nameservers (לדוגמה):
- `andy.ns.cloudflare.com`
- `eva.ns.cloudflare.com`

לך לחברה שמנהלת לך את הדומיין (גודאדי / וויקס / ישראלום) ושנה את ה-nameservers לאלה. הפעולה לוקחת 5 דקות עד 24 שעות להתפשט.

#### שלב 3: הגדרות אבטחה ב-Cloudflare Dashboard

**SSL/TLS → Overview**:
- בחר **Full (strict)** — מבטיח שכל התעבורה מוצפנת כל הדרך.

**SSL/TLS → Edge Certificates**:
- ✅ **Always Use HTTPS**: On
- ✅ **HTTP Strict Transport Security (HSTS)**: On (max-age 12 חודשים)
- ✅ **Minimum TLS Version**: TLS 1.2

**Security → WAF → Custom Rules** (אופציונלי, חינם 5 כללים):
```
Rule 1: חסום SQL Injection patterns
Field: URI Path
Operator: contains
Value: ' OR '1'='1
Action: Block
```

**Security → Bots → Bot Fight Mode**: On (חוסם בוטים זדוניים)

**Network → Network**:
- ❌ **0-RTT Connection Resumption**: Off (מונע replay attacks)

**Security → Settings → Security Level**: Medium

**Rules → Page Rules → Create Page Rule** (אופציונלי):
```
URL: yoursite.com/login
Setting: Security Level → High
```

#### שלב 4: Geo-blocking (חוסם גישה מחו"ל)
**Security → WAF → Custom Rules**:
```
Rule: רק ישראל
Field: ip.geoip.country
Operator: ne (לא שווה)
Value: IL
Action: Block
```

⚠️ **הערה**: אם יש לך משתמשים שמתחברים מחו"ל (חופשה, שליחות) — הגדר Whitelist במקום בלוק מוחלט.

#### שלב 5: Hide Origin (חשוב!)
**DNS → Records**: וודא שכל ה-records של האתר עם **🟠 Proxied** (לא 🔵 DNS only). זה מסתיר את ה-IP של Vercel.

---

### 2. גיבוי DB — הגדרת GitHub Secrets

הגיבוי השבועי רץ אוטומטית, אבל צריך להגדיר את ה-secrets:

1. לך ל-`https://github.com/yishayozery/palsam/settings/secrets/actions`
2. הוסף secret חדש: `DATABASE_URL` עם ה-connection string של Neon
3. (אופציונלי, להעלאה ל-S3):
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `S3_BACKUP_BUCKET` (שם הבאקט)
   - `AWS_REGION` (לדוגמה `eu-central-1`)

הגיבוי ירוץ אוטומטית כל יום שישי ב-05:00 בבוקר. ניתן להריץ ידנית מ-`Actions → 💾 גיבוי שבועי DB → Run workflow`.

הקבצים נשמרים כ-Artifacts ב-GitHub למשך 90 יום. ניתן להוריד מהדפדפן.

---

### 3. Cloudflare Access (אופציונלי, $3/משתמש/חודש)
לאבטחה מוגברת:
- מחייב 2FA דרך Google / Microsoft / SMS
- מחייב כניסה רק ממכשירים מאושרים
- מחייב VPN של היחידה

---

## 🔍 בדיקות אבטחה אחרי הפעלה

### בדיקת Security Headers
```bash
curl -I https://yoursite.com
```
צריך לראות:
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

### בדיקת Rate Limit
נסה להיכנס 6 פעמים עם סיסמה שגויה — הניסיון ה-6 צריך לקבל שגיאה "🛡️ יותר מדי ניסיונות".

### בדיקת ציון אבטחה
- https://securityheaders.com/?q=yoursite.com — צריך לקבל A או A+
- https://www.ssllabs.com/ssltest/analyze.html?d=yoursite.com — צריך לקבל A או A+

---

## 🚨 מה לא מכוסה ולמה זה חשוב

### לא מכוסה:
- ❌ **2FA לאדמינים** — מומלץ בחיים, אבל דורש implementation (אני יכול לעשות)
- ❌ **WAF מתקדם** — Free plan מוגבל
- ❌ **PII Encryption at rest** — Neon מצפין את ה-DB ברמת disk, אבל לא ברמת שדה
- ❌ **בדיקות חדירות אוטומטיות** — דורש שירות בתשלום
- ❌ **DDoS L7 — Cloudflare Free** מגן ברמת L3/L4 אבל לא מלא ב-L7

### לא יכול לעשות (תלוי בארגון):
- ❌ העברה לשרתים ישראליים
- ❌ אישור צה"לי / ISO 27001 / SOC 2
- ❌ הפרדת רשתות

---

## 🎯 בקצרה — מה לעשות עכשיו

1. **הפעל Cloudflare Free** (15 דק') — הכי משמעותי.
2. **הוסף GitHub Secret `DATABASE_URL`** (2 דק') — לגיבוי השבועי.
3. **בדוק https://securityheaders.com** — שתקבל A+.

זה ייתן לך אתר מוגן ברמה סבירה להצגה למפקד שלך / קב"ט.

לפני **שימוש אמיתי בציוד מסווג** — חובה לעבור דרך הקב"ט.
