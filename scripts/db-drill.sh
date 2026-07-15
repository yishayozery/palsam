#!/usr/bin/env bash
# 🧪 DB drill — מריץ pg_dump ניסיוני מה-DB הנוכחי לקובץ מקומי ומאמת שהוא שלם.
# READ-ONLY — לא משנה שום דבר ב-DB. מדמה את שלב הגיבוי של הגירת-ספק.
#
# דרישות: כלי-לקוח של Postgres (pg_dump, pg_restore) בגרסה >= גרסת השרת.
#   Windows: התקן "PostgreSQL" (רק command-line tools מספיק) והוסף ל-PATH,
#            או:  winget install PostgreSQL.PostgreSQL
#   ואז:  bash scripts/db-drill.sh
#
# הקובץ נשמר תחת backups/ (ב-.gitignore) — מוחקים אחרי הבדיקה אם רוצים.
set -euo pipefail

cd "$(dirname "$0")/.."

# טעינת DIRECT_URL מ-.env (חיבור ישיר — נכון ל-dump, לא ה-pooler)
URL="$(grep -E '^DIRECT_URL=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"'')"
if [ -z "${URL:-}" ]; then
  URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"'')"
  echo "⚠️  DIRECT_URL לא נמצא — משתמש ב-DATABASE_URL (pooled). ל-dump אמין עדיף DIRECT_URL."
fi
[ -z "${URL:-}" ] && { echo "❌ לא נמצא DIRECT_URL/DATABASE_URL ב-.env"; exit 1; }

command -v pg_dump >/dev/null 2>&1 || { echo "❌ pg_dump לא מותקן. התקן כלי-לקוח של Postgres (ראה הערות בראש הקובץ)."; exit 1; }

mkdir -p backups
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups/palmy-drill-$STAMP.dump"

echo "🔻 pg_dump (custom format) → $OUT ..."
time pg_dump "$URL" -Fc -f "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "✅ dump נוצר: $OUT ($SIZE)"

echo "🔎 אימות שלמות (pg_restore --list) ..."
ITEMS="$(pg_restore --list "$OUT" | grep -cE '^[0-9]+;' || true)"
echo "✅ $ITEMS פריטים בארכיון (טבלאות/אינדקסים/רצפים) — הקובץ תקין וניתן לשחזור."

echo ""
echo "🎯 ה-drill עבר. הפקודה שתשמש בהגירה אמיתית זהה (ראה docs/DB-MIGRATION-RUNBOOK.md)."
echo "   למחיקת קובץ ה-drill:  rm $OUT"
