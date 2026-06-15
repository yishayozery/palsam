// 🚀 מריץ prisma migrate deploy עם החיבור הנכון:
// - אם DIRECT_URL מוגדר → משתמש בו (תומך ב-advisory locks - עובד עם Neon Pooler)
// - אחרת → נופל ל-DATABASE_URL (עלול להיכשל אם זה Pooler URL)
// - לפני המיגרציה: משחרר advisory locks תקועים מ-build קודם שנפל באמצע
import { spawnSync } from "child_process";

const env = { ...process.env };
const directUrl = process.env.DIRECT_URL;
const dbUrl = process.env.DATABASE_URL;

const migrateUrl = directUrl || dbUrl;
if (directUrl) {
  console.log("ℹ️  Running prisma migrate deploy with DIRECT_URL (bypassing pooler for advisory locks)");
  env.DATABASE_URL = directUrl;
} else if (dbUrl && dbUrl.includes("-pooler")) {
  console.warn("⚠️  DATABASE_URL נראה כמו Neon Pooler ואין DIRECT_URL — מיגרציות עלולות לפסול עקב advisory lock timeout");
}

// 🔓 שחרור advisory locks תקועים (אם build קודם נפל באמצע ולא שחרר)
// משתמש ב-Prisma הקיים (אין צורך להתקין pg)
if (migrateUrl) {
  try {
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const p = new PrismaClient({ datasources: { db: { url: migrateUrl } } });
    const rows = await p.$queryRawUnsafe(`
      SELECT pid, pg_terminate_backend(pid) AS terminated
      FROM pg_locks
      WHERE locktype = 'advisory' AND objid = 72707369;
    `);
    if (Array.isArray(rows) && rows.length > 0) {
      console.log(`🔓 שוחררו ${rows.length} חיבורים תקועים שהחזיקו את ה-advisory lock`);
    }
    await p.$disconnect();
  } catch (e) {
    console.warn("⚠️  לא הצלחתי לשחרר advisory locks מראש:", e?.message ?? e);
  }
}

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  env, stdio: "inherit", shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
