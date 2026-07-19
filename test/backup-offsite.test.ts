import { describe, it, expect } from "vitest";
import { gzipSync, gunzipSync } from "zlib";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

// מקבע את שרשרת העותק ה-off-site (backup.ts): gzip → base64 → הצפנה,
// ובצד השחזור (decrypt-backup.ts): פענוח → base64 → gunzip. חייב לשחזר בדיוק.
describe("off-site backup round-trip (gzip → encrypt → decrypt → gunzip)", () => {
  it("משחזר את ה-JSON המקורי בדיוק, כולל עברית", () => {
    const snapshot = JSON.stringify({
      version: 2,
      tables: { soldiers: [{ id: "s1", personalNumber: "7111076", fullName: "שמעון הילמן" }] },
      reference: { squads: [{ name: "מפג\"ד" }] },
    });

    // צד הגיבוי
    const gz = gzipSync(Buffer.from(snapshot, "utf8")).toString("base64");
    const enc = encryptSecret(gz);
    expect(enc.startsWith("v1:")).toBe(true);

    // צד השחזור
    const back = gunzipSync(Buffer.from(decryptSecret(enc), "base64")).toString("utf8");
    expect(back).toBe(snapshot);
    expect(JSON.parse(back).tables.soldiers[0].fullName).toBe("שמעון הילמן");
  });
});
