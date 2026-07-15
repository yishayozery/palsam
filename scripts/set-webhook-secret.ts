/**
 * רישום secret_token ל-webhook של כל בוטי הגדודים.
 * מריצים פעם אחת אחרי שמגדירים TELEGRAM_WEBHOOK_SECRET (אותו ערך ב-.env המקומי וב-Vercel).
 *
 * הרצה:
 *   1) הגדר ב-.env:  TELEGRAM_WEBHOOK_SECRET=<אותו ערך שתשים ב-Vercel>
 *   2) npx tsx scripts/set-webhook-secret.ts
 *
 * הסקריפט קורא את ה-URL הנוכחי של כל בוט (getWebhookInfo) ומחדש אותו עם secret_token —
 * בלי לשנות דומיין. מרגע זה, כל POST מזויף (בלי ה-header) נדחה ע"י האפליקציה.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma";
import { decryptSecret } from "../src/lib/crypto";
const p = new PrismaClient();

async function main() {
  const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!SECRET || SECRET.length < 12) {
    console.error("❌ הגדר קודם TELEGRAM_WEBHOOK_SECRET ב-.env (12+ תווים, אותו ערך שתגדיר ב-Vercel).");
    process.exit(1);
  }
  const bats = await p.battalion.findMany({ where: { telegramBotToken: { not: null } }, select: { name: true, code: true, telegramBotToken: true } });
  console.log(`נמצאו ${bats.length} גדודים עם בוט.\n`);
  for (const b of bats) {
    const tok = decryptSecret(b.telegramBotToken!);
    try {
      const info: any = await fetch(`https://api.telegram.org/bot${tok}/getWebhookInfo`).then((r) => r.json());
      const url = info?.result?.url;
      if (!url) { console.log(`⚠️  ${b.name} (${b.code}): אין webhook רשום — דילוג`); continue; }
      const res: any = await fetch(`https://api.telegram.org/bot${tok}/setWebhook`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, secret_token: SECRET, drop_pending_updates: false }),
      }).then((r) => r.json());
      console.log(`${res.ok ? "✅" : "❌"} ${b.name} (${b.code}) → ${url}   ${res.description ?? ""}`);
    } catch (e) {
      console.log(`❌ ${b.name} (${b.code}): ${String(e).slice(0, 120)}`);
    }
  }
  console.log(`\nסיום. ודא ש-TELEGRAM_WEBHOOK_SECRET מוגדר גם ב-Vercel (אותו ערך) והפרויקטים נפרסו מחדש.`);
}
main().then(() => p.$disconnect()).catch((e) => { console.error(e); p.$disconnect(); });
