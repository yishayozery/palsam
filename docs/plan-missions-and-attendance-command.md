# תוכניות פיתוח — לאישור לפני קוד

## A. שבצ"קים → "משימות" (ריבוי רכבים + רכב/חייל חוץ + תצוגה ויזואלית)

### מצב קיים
`VehicleAssignment` = **רכב יחיד** + חיילים, לתאריך/שעה. `VehicleAssignmentSoldier` דורש `soldierId` אמיתי. `DispatchTemplate` (שבצ"ק קבוע) = רכב יחיד + slots.

### שינויי סכמה
1. **מודל חדש `Mission`** — קבוצת רכבים תחת משימה אחת:
   `id, battalionId, companyId?, title?, missionDate, departureTime, notes?, createdById, completedAt?, completedById?` · `vehicles VehicleAssignment[]`
2. **`VehicleAssignment`**:
   - `missionId String?` (שיוך למשימה; קיימים עם null ממשיכים לעבוד)
   - `vehicleSerialUnitId` → **nullable**
   - `+ isExternal Boolean @default(false)`, `externalVehicleNumber String?`, `externalVehicleTypeName String?`
3. **`VehicleAssignmentSoldier`**:
   - `soldierId` → **nullable** · `+ externalName String?`, `externalPersonalNumber String?`

### שרת (actions)
`createMission` / `updateMission` / `completeMission`; `addVehicleToMission` (רכב מערכת / מ-template / חוץ); הוספת חיילים (מרשימה + ידני חוץ). טעינת שבצ"ק קבוע → מושכת רכב + תפקידים + חיילים לרכב במשימה.

### UI (`/dispatch`)
- שינוי שם: "שבצ"ק חדש" → **"משימה חדשה"**, וכותרות שבצ"ק→משימה.
- טופס משימה: פרטי משימה (תאריך/שעה/כותרת/פלוגה) + **רשימת רכבים** (הוסף כמה):
  לכל רכב — בחירה מ: (א) רכב מהמערכת, (ב) **משבצק קבוע**, (ג) **רכב חוץ** (מס' + סוג + חיילים ידניים). חיילים לרכב: בחירה מרשימת היחידה + הוספה ידנית (שם + מ.א).
- **תצוגה ויזואלית של השיירה**: אייקוני רכב מקובצים לפי סוג עם כמות (🚙×2 האמר · 🚚×2 משאית).

### בוט
עדכון זרימת יצירת השבצ"ק בבוט לתמיכה בריבוי רכבים + חוץ.

### שלבים
1) סכמה+מיגרציה · 2) actions · 3) טופס משימה · 4) קומפוננטת שיירה ויזואלית · 5) תצוגת רשימה · 6) בוט · 7) בדיקה.

---

## B. מסך שלישות לנוכחות (תמונת ראי + אישור/נעילה + 5 קטגוריות + אחוזים)

### מצב קיים
`AttendanceRecord`/`AttendancePlan` (סטטוס פר חייל/יום, unique [soldierId,date]). `AttendanceStatus` (name/color/icon/isPresent). **אין** שעת-דיווח ייעודית, אין נעילה, אין אישור.

### שינויי סכמה
1. **מודל חדש `AttendanceApproval`** — אישור+נעילה פר פלוגה/מחלקה ליום:
   `id, battalionId, date, scope (COMPANY|SQUAD), companyId?, squadId?, approvedById, approvedAt, locked Boolean` · unique([companyId/squadId, date]).
2. **`AttendanceStatus` + `hqCategory`** (enum): מיפוי כל סטטוס לאחת מ-5 קטגוריות הדיווח לקודקוד:
   `IN_UNIT` (ביחידה: נמצא/יום יציאה/יום כניסה) · `HOME` (בית) · `SICK` (מחלה) · `ORGANIZING` (ימי התארגנות) · `ORGANIZING_WEEKDAY` (ימי התארגנות חול).
3. **סטטוסים חדשים** (3-5): מחלה (אם חסר), ימי התארגנות, ימי התארגנות חול.
4. (אופציונלי) `reportedAt`/`reportedById` ל-AttendanceRecord — לתיעוד שעת הדיווח.

### RBAC
מסך חדש `attendance_command` — נראה רק ל-**SHALISH / MAGAD / SAMAGAD / BATTALION_ADMIN(מפמ)**. הוספת Screen + backfill ל-ScreenPermission של גדודים קיימים + nav.

### UI (`/attendance/command`)
- תמונת ראי של הביצוע (AttendanceRecord) מקובצת פלוגה→מחלקה→חיילים.
- לכל פלוגה/מחלקה: **"אשר ונעל"** — יוצר AttendanceApproval+locked. אחרי נעילה, עריכות לאותו scope/יום חסומות.
- **5 כפתורי דיווח לקודקוד** למטה — צבירת חיילים לפי קטגוריה (ביחידה/בית/מחלה/התארגנות/התארגנות חול) עם רשימות לייצוא.
- ליד כל חייל: **אחוזים לכל קטגוריה** מסך ימי הדיווח עליו.

### אכיפה
חסימת עריכת נוכחות (record) בפלוגה/מחלקה+יום שננעלו — ב-actions הקיימים.

### שלבים
1) סכמה+מיגרציה (Approval, hqCategory, seed סטטוסים) · 2) RBAC screen+backfill+nav · 3) מסך תמונת ראי + אשר/נעל · 4) אכיפת נעילה · 5) 5 קטגוריות + כפתורים · 6) אחוזים פר חייל · 7) בדיקה.

---

### נקודות לאישור
- A: מודל `Mission` נפרד (מומלץ) מול הוספת `missionGroupId` בלבד.
- B: האם הקטגוריות 1+2 (ביחידה/בית) ממופות מהסטטוסים הקיימים, ורק 3-5 חדשים? (זו ההנחה שלי)
- B: נעילה ברמת **פלוגה** ו/או **מחלקה**? (התוכנית תומכת בשתיהן)
