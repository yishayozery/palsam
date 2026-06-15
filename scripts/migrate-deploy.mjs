// 🚀 מריץ prisma migrate deploy עם החיבור הנכון:
// - אם DIRECT_URL מוגדר → משתמש בו (תומך ב-advisory locks - עובד עם Neon Pooler)
// - אחרת → נופל ל-DATABASE_URL (עלול להיכשל אם זה Pooler URL)
import { spawnSync } from "child_process";

const env = { ...process.env };
const directUrl = process.env.DIRECT_URL;
const dbUrl = process.env.DATABASE_URL;

if (directUrl) {
  console.log("ℹ️  Running prisma migrate deploy with DIRECT_URL (bypassing pooler for advisory locks)");
  env.DATABASE_URL = directUrl;
} else if (dbUrl && dbUrl.includes("-pooler")) {
  console.warn("⚠️  DATABASE_URL נראה כמו Neon Pooler ואין DIRECT_URL — מיגרציות עלולות לפסול עקב advisory lock timeout");
  console.warn("    הוסף ENV var ל-Vercel בשם DIRECT_URL עם אותו URL בלי '-pooler'.");
} else {
  console.log("ℹ️  Running prisma migrate deploy with DATABASE_URL (no pooler detected)");
}

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  env, stdio: "inherit", shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
