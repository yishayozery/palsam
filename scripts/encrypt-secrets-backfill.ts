/**
 * גיבוב-ל-הצפנה: מצפין ערכי סוד קיימים בטקסט גלוי (telegramBotToken, totpSecret).
 *
 * ⚠️ חובה להריץ עם אותו ENCRYPTION_KEY/AUTH_SECRET שמוגדר בפרודקשן (Vercel),
 *    אחרת הערכים יוצפנו במפתח שגוי והפרודקשן לא יוכל לפענח אותם.
 *
 * הרצה:  node --env-file=.env -r ts-node/register scripts/encrypt-secrets-backfill.ts
 *   או:  npx tsx --env-file=.env scripts/encrypt-secrets-backfill.ts
 *
 * אידמפוטנטי — מדלג על ערכים שכבר מוצפנים (מתחילים ב-"v1:").
 */
import { PrismaClient } from "../src/generated/prisma";
import { encryptSecret, isEncrypted } from "../src/lib/crypto";

const p = new PrismaClient();

async function main() {
  let bat = 0;
  const battalions = await p.battalion.findMany({ where: { telegramBotToken: { not: null } }, select: { id: true, telegramBotToken: true } });
  for (const b of battalions) {
    if (!b.telegramBotToken || isEncrypted(b.telegramBotToken)) continue;
    await p.battalion.update({ where: { id: b.id }, data: { telegramBotToken: encryptSecret(b.telegramBotToken) } });
    bat++;
  }

  let usr = 0;
  const users = await p.appUser.findMany({ where: { totpSecret: { not: null } }, select: { id: true, totpSecret: true } });
  for (const u of users) {
    if (!u.totpSecret || isEncrypted(u.totpSecret)) continue;
    await p.appUser.update({ where: { id: u.id }, data: { totpSecret: encryptSecret(u.totpSecret) } });
    usr++;
  }

  console.log(`✅ הוצפנו ${bat} טוקני-בוט ו-${usr} סודות TOTP.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());
