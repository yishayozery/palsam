import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import TotpSetup from "./TotpSetup";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const user = await requireUser();
  const me = await prisma.appUser.findUnique({
    where: { id: user.id },
    select: { totpSecret: true, totpEnabledAt: true },
  });
  const enabled = !!me?.totpSecret;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="🔐 אבטחה אישית"
        subtitle="ניהול אימות דו-שלבי (2FA) — שכבת הגנה נוספת על החשבון שלך"
      />

      <Card className="p-5 mb-4">
        <div className="flex items-start gap-4">
          <div className={`text-5xl ${enabled ? "" : "opacity-40"}`}>🔐</div>
          <div className="flex-1">
            <h3 className="font-bold text-lg text-slate-800">
              אימות דו-שלבי (Google Authenticator)
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              ברגע שמופעל, בכל כניסה תידרש להזין קוד 6 ספרות מאפליקציית
              Google Authenticator / Microsoft Authenticator שלך בנוסף לסיסמה.
              <br />
              זה מונע כניסה לחשבון שלך גם אם הסיסמה דלפה.
            </p>
            <div className="mt-3">
              {enabled ? (
                <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 text-sm text-emerald-800">
                  ✓ פעיל מאז {me!.totpEnabledAt?.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-sm text-amber-800">
                  ⚠️ לא פעיל — מומלץ במיוחד לאדמינים
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      <TotpSetup enabled={enabled} />
    </div>
  );
}
