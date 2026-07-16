/**
 * פענוח עותק off-site של גיבוי PALMY (צרופת המייל המוצפנת).
 *
 * שימוש:  npx tsx scripts/decrypt-backup.ts <backup-file> [out.json]
 *   • <backup-file> = הקובץ שנשמר מצרופת המייל (palmy-backup-*.json.gz.enc)
 *   • דורש את אותו ENCRYPTION_KEY של הפרודקשן ב-env (אחרת הפענוח ייכשל).
 *
 * הפלט: JSON השחזור המלא ({ version, tables, reference }) — קלט ל-restore-into-battalion.ts.
 */
import { readFileSync, writeFileSync } from "fs";
import { gunzipSync } from "zlib";
import { decryptSecret } from "../src/lib/crypto";

const inPath = process.argv[2];
const outPath = process.argv[3] || (inPath ? inPath.replace(/\.enc$/, "") : "");
if (!inPath) {
  console.error("שימוש: npx tsx scripts/decrypt-backup.ts <backup-file.json.gz.enc> [out.json]");
  process.exit(1);
}
if (!process.env.ENCRYPTION_KEY && !process.env.AUTH_SECRET) {
  console.error("❌ חסר ENCRYPTION_KEY (או AUTH_SECRET) ב-env — חובה מפתח הפרודקשן לפענוח.");
  process.exit(1);
}

const enc = readFileSync(inPath, "utf8").trim();
const b64 = decryptSecret(enc);
if (!b64) {
  console.error("❌ הפענוח נכשל — כנראה ENCRYPTION_KEY שגוי או קובץ פגום.");
  process.exit(1);
}
const json = gunzipSync(Buffer.from(b64, "base64")).toString("utf8");
const parsed = JSON.parse(json);
const counts = Object.fromEntries(Object.entries(parsed.tables ?? {}).map(([k, v]) => [k, (v as unknown[]).length]));
writeFileSync(outPath, json);
console.log(`✅ פוענח → ${outPath}`);
console.log(`   טבלאות:`, counts);
