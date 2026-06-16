// 🚀 prisma migrate deploy עם חיבור נכון + retry בכישלון לוק תקוע.
import { spawnSync } from "child_process";

const env = { ...process.env };
const directUrl = process.env.DIRECT_URL;
const dbUrl = process.env.DATABASE_URL;
const migrateUrl = directUrl || dbUrl;

if (directUrl) {
  console.log("ℹ️  Using DIRECT_URL for migrate (bypasses pooler)");
  env.DATABASE_URL = directUrl;
} else if (dbUrl && dbUrl.includes("-pooler")) {
  console.warn("⚠️  DATABASE_URL is pooler URL and no DIRECT_URL set — advisory lock may timeout");
}

const ADVISORY_LOCK_ID = 72707369;

async function releaseStuckLocks() {
  try {
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const p = new PrismaClient({ datasources: { db: { url: migrateUrl } } });
    const rows = await p.$queryRawUnsafe(`
      SELECT pid, pg_terminate_backend(pid) AS terminated
      FROM pg_locks
      WHERE locktype = 'advisory' AND objid = ${ADVISORY_LOCK_ID};
    `);
    await p.$disconnect();
    return Array.isArray(rows) ? rows.length : 0;
  } catch (e) {
    console.warn("⚠️  release locks failed:", e?.message ?? e);
    return 0;
  }
}

async function hasPendingMigrations() {
  try {
    const res = spawnSync("npx", ["prisma", "migrate", "status"], {
      env, encoding: "utf-8", shell: process.platform === "win32",
    });
    const output = (res.stdout || "") + (res.stderr || "");
    if (output.includes("Database schema is up to date")) return false;
    if (output.includes("have not yet been applied") || output.includes("Following migration") || output.includes("pending")) return true;
    return res.status !== 0;
  } catch {
    return true;
  }
}

function runMigrate() {
  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    env, stdio: "inherit", shell: process.platform === "win32",
  });
  return result.status ?? 1;
}

(async () => {
  // 0. דילוג אם אין מיגרציות תלויות
  if (!(await hasPendingMigrations())) {
    console.log("✓ No pending migrations — skipping migrate deploy");
    process.exit(0);
  }

  // 1. שחרור לוקים תקועים
  const released = await releaseStuckLocks();
  if (released > 0) console.log(`🔓 Released ${released} stuck connections holding advisory lock`);

  // 2. ניסיון ראשון
  let code = runMigrate();
  if (code === 0) process.exit(0);

  // 3. retry בכישלון
  console.log("⚠️  First attempt failed. Releasing locks and retrying...");
  const released2 = await releaseStuckLocks();
  console.log(`🔓 Released ${released2} stuck connections (round 2)`);
  await new Promise((r) => setTimeout(r, 2000));

  code = runMigrate();
  process.exit(code);
})();
