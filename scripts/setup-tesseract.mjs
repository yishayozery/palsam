/**
 * 🔤 הכנת נכסי Tesseract להגשה מקומית (self-hosted).
 *
 * ה-CSP של האפליקציה הוא `connect-src 'self'` / `script-src 'self'`, ולכן
 * אי-אפשר לטעון את ה-worker/wasm/traineddata מ-CDN (וזה גם רצוי — המסמך
 * הצבאי נשאר לגמרי על הדומיין שלנו). הסקריפט מעתיק את הליבה מ-node_modules
 * ומוריד את מודל השפה אל public/tesseract/, כדי שהכל יוגש מ-'self'.
 *
 * רץ ב-prebuild (ראה package.json) וגם ידנית:
 *   node scripts/setup-tesseract.mjs
 */
import { mkdir, copyFile, access, stat, writeFile, readdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public", "tesseract");
const TESSDATA = join(OUT, "tessdata");

// worker מ-tesseract.js. את כל קבצי הליבה מעתיקים גורף (js/wasm/wasm.js),
// כי tesseract.js v7 בוחר וריאנט לפי יכולות הדפדפן וטוען את ה-loader המתאים.

// מודל שפה — tessdata_fast (קל, ~2-4MB). eng לספרות; heb לתיאור.
const LANGS = {
  eng: "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata",
  heb: "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/heb.traineddata",
};

const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

async function main() {
  await mkdir(TESSDATA, { recursive: true });

  await copyFile(join(root, "node_modules/tesseract.js/dist/worker.min.js"), join(OUT, "worker.min.js"));
  const coreDir = join(root, "node_modules/tesseract.js-core");
  const coreFiles = (await readdir(coreDir)).filter((f) => /\.(js|wasm)$/.test(f));
  for (const f of coreFiles) await copyFile(join(coreDir, f), join(OUT, f));
  console.log(`✅ הועתקו worker + ${coreFiles.length} קבצי ליבה → public/tesseract/`);

  for (const [lang, url] of Object.entries(LANGS)) {
    const dst = join(TESSDATA, `${lang}.traineddata`);
    if (await exists(dst)) {
      const s = await stat(dst);
      if (s.size > 100_000) { console.log(`⏭️  ${lang}.traineddata קיים (${(s.size / 1e6).toFixed(1)}MB)`); continue; }
    }
    process.stdout.write(`⬇️  מוריד ${lang}.traineddata … `);
    const res = await fetch(url);
    if (!res.ok || !res.body) { console.log(`❌ ${res.status}`); continue; }
    await pipeline(res.body, createWriteStream(dst));
    const s = await stat(dst);
    console.log(`✓ ${(s.size / 1e6).toFixed(1)}MB`);
  }

  // מטא לתיעוד המקור
  await writeFile(join(OUT, "SOURCE.txt"),
    "נכסי Tesseract self-hosted (CSP: connect-src 'self').\nליבה: node_modules/tesseract.js*.\nמודל: tessdata_fast (eng, heb).\nמיוצר ע\"י scripts/setup-tesseract.mjs — אין לערוך ידנית.\n", "utf8");
  console.log("🎯 הסתיים.");
}
main().catch((e) => { console.error("❌", e); process.exit(1); });
