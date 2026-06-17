import { prisma } from "@/lib/prisma";
import SignaturePad from "./SignaturePad";
import CenteredWithRedirect from "./CenteredWithRedirect";
import { WEAPONS_AGREEMENT_TITLE, WEAPONS_AGREEMENT_CLAUSES, WEAPONS_AGREEMENT_FOOTER } from "@/lib/weapons-agreement-text";

export const dynamic = "force-dynamic";

export default async function PublicSignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const sig = await prisma.signature.findUnique({
    where: { token },
    include: {
      battalion: true,
      soldier: true,
      signerUser: { include: { holder: true } },
      transfer: {
        include: {
          lines: { include: { itemType: true, serialUnit: true } },
          fromHolder: { select: { signatureClause: true, weaponsAgreementText: true, name: true, warehouseType: true } },
        },
      },
    },
  });

  const unitName = sig?.battalion?.name || "גדוד";
  const logo = sig?.battalion?.logoData;
  // הנמען: חייל או משתמש (החתמת פלוגה)
  const signerName = sig?.soldier?.fullName ?? sig?.signerUser?.fullName ?? "";
  const signerSubtitle = sig?.soldier
    ? sig.soldier.personalNumber
    : sig?.signerUser
      ? `${sig.signerUser.username}${sig.signerUser.holder ? ` · ${sig.signerUser.holder.name}` : ""}`
      : "";
  const isCompanySign = !!sig?.signerUserId;

  if (!sig) {
    return <CenteredWithRedirect title="קישור לא תקין" text="ההחתמה אינה קיימת." tone="error" />;
  }
  if (sig.status === "SIGNED") {
    return <CenteredWithRedirect title="✅ נחתם בהצלחה" text={`תודה, ${signerName}. החתימה נקלטה במערכת.`} tone="ok" />;
  }
  if (sig.status === "EXPIRED" || (sig.tokenExpires && sig.tokenExpires < new Date())) {
    return <CenteredWithRedirect title="פג תוקף" text="הקישור אינו בתוקף. פנה לאחראי." tone="error" />;
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="bg-slate-800 text-white p-5 flex items-center gap-3">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="סמל הגדוד" className="w-12 h-12 object-contain bg-white/10 rounded p-1" />
          )}
          <div>
            <div className="text-xs text-slate-300">PALSAM · {unitName}</div>
            {sig.battalion?.motto && <div className="text-[11px] text-amber-300/80 italic">״{sig.battalion.motto}״</div>}
            <h1 className="text-lg font-bold">{isCompanySign ? "החתמת פלוגה" : "אישור וחתימה על ציוד"}</h1>
            <p className="text-sm text-slate-300 mt-1">
              {signerName} {signerSubtitle && <span>· {signerSubtitle}</span>}
            </p>
          </div>
        </div>

        <div className="p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">📋 פירוט הציוד להחתמה:</h2>
          <div className="space-y-1.5 mb-5">
            {sig.transfer?.lines.map((l) => (
              <div key={l.id} className="bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-200">
                <div className="flex justify-between items-start">
                  <span className="font-bold text-sm text-slate-800">{l.itemType.name}</span>
                  {!l.serialUnit && <span className="font-mono text-xs bg-blue-100 text-blue-800 rounded px-1.5 py-0.5">×{l.quantity}</span>}
                </div>
                {l.serialUnit && (
                  <div className="text-xs font-mono text-indigo-700 mt-0.5 bg-indigo-50 rounded px-2 py-0.5 inline-block">
                    SN: {l.serialUnit.serialNumber}
                    {l.serialUnit.lotQuantity && l.serialUnit.lotQuantity > 1 && (
                      <span className="text-slate-500 mr-1">× {l.serialUnit.lotQuantity}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 🔫 נוהל שמירת נשק — מוצג כשהחתמה מארמון */}
          {sig.transfer?.fromHolder?.warehouseType === "ARMORY" && !isCompanySign && (
            <div className="mb-4 bg-rose-50 border-2 border-rose-300 rounded-xl p-3">
              <div className="text-[11px] font-bold text-rose-900 mb-1.5 uppercase tracking-wide">
                🔫 {WEAPONS_AGREEMENT_TITLE}
              </div>
              <div className="text-[13px] text-slate-800 leading-relaxed space-y-1.5">
                {sig.transfer.fromHolder.weaponsAgreementText
                  ? sig.transfer.fromHolder.weaponsAgreementText.split("\n").filter(Boolean).map((line, i) => <p key={i}>{line}</p>)
                  : WEAPONS_AGREEMENT_CLAUSES.map((c, i) => <p key={i}>{i + 1}. {c}</p>)
                }
              </div>
              <div className="text-[11px] text-rose-700 mt-2 pt-2 border-t border-rose-200">
                {WEAPONS_AGREEMENT_FOOTER}
              </div>
            </div>
          )}

          {/* 📝 תניית חתימה - חייב לקרוא לפני שחותם */}
          {sig.transfer?.fromHolder?.signatureClause && (
            <div className="mb-4 bg-amber-50 border-2 border-amber-300 rounded-xl p-3">
              <div className="text-[11px] font-bold text-amber-900 mb-1.5 uppercase tracking-wide">
                📝 הצהרת חייל ({sig.transfer.fromHolder.name})
              </div>
              <pre className="text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
                {sig.transfer.fromHolder.signatureClause}
              </pre>
              <div className="text-[11px] text-amber-700 mt-2 pt-2 border-t border-amber-200">
                ⚠️ קרא בעיון. החתימה למטה מאשרת שקראת ואתה מסכים לתנאים.
              </div>
            </div>
          )}

          <SignaturePad token={token} soldierName={signerName} isCompanySign={isCompanySign} />
        </div>
      </div>
    </div>
  );
}

