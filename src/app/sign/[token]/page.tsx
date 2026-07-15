import { prisma } from "@/lib/prisma";
import SignaturePad from "./SignaturePad";
import EditableItemList from "./EditableItemList";
import CenteredWithRedirect from "./CenteredWithRedirect";
import { WEAPONS_AGREEMENT_TITLE, WEAPONS_AGREEMENT_CLAUSES, WEAPONS_AGREEMENT_FOOTER } from "@/lib/weapons-agreement-text";
import { linkTokenQuery } from "@/lib/link-token";
import { getSoldierWeaponsEligibility } from "@/lib/weapons-eligibility";

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
          fromHolder: { select: { signatureClause: true, weaponsAgreementText: true, name: true, warehouseType: true, armoryTestUrl: true } },
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

  // אישור מפקד לנשק — טוענים שם + חתימה של המאשר
  const isArmoryTransfer = sig.transfer?.fromHolder?.warehouseType === "ARMORY" && !isCompanySign;
  let commanderApproval: { name: string; date: string; signature: string | null } | undefined;
  if (isArmoryTransfer && sig.soldier?.weaponsApprovedById) {
    const approver = await prisma.appUser.findUnique({
      where: { id: sig.soldier.weaponsApprovedById },
      select: { fullName: true },
    });
    commanderApproval = {
      name: approver?.fullName ?? "מפקד",
      date: sig.soldier.weaponsApprovedAt?.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" }) ?? "",
      signature: sig.soldier.weaponsApprovalSignature ?? null,
    };
  }
  if (sig.status === "SIGNED") {
    const base = process.env.NEXT_PUBLIC_APP_URL || "";
    const docTok = sig.transferId ? linkTokenQuery("transfer-doc", sig.transferId) : "";
    const pdfUrl = sig.transferId ? `${base}/api/transfer-doc/${sig.transferId}/pdf${docTok}` : null;
    const docUrl = sig.transferId ? `${base}/transfer-doc/${sig.transferId}${docTok}` : null;
    const soldierPhone = sig.soldier?.phone ?? sig.signerUser?.phone ?? null;
    const normalizedPhone = soldierPhone?.replace(/\D/g, "").replace(/^0/, "972") ?? "";
    const pdfWaText = pdfUrl
      ? encodeURIComponent(`שלום ${signerName}, מצורף אישור החתמת ציוד.\nלהורדת התעודה כ-PDF:\n${pdfUrl}`)
      : null;
    const pdfWaUrl = pdfWaText && normalizedPhone
      ? `https://wa.me/${normalizedPhone}?text=${pdfWaText}`
      : pdfWaText
        ? `https://wa.me/?text=${pdfWaText}`
        : null;

    const hasTelegram = !!(sig.soldier?.telegramChatId);

    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-sm w-full">
          <div className="text-5xl mb-3">✅</div>
          <h1 className="text-2xl font-bold text-emerald-700">נחתם בהצלחה</h1>
          <p className="text-sm text-slate-500 mt-2">{`תודה, ${signerName}. החתימה נקלטה במערכת.`}</p>
          {sig.signedAt && (
            <p className="text-xs text-slate-400 mt-1">
              {sig.signedAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}
            </p>
          )}
          <div className={`mt-3 text-xs font-medium ${hasTelegram ? "text-blue-600" : "text-slate-400"}`}>
            {hasTelegram ? "✅ הודעת טלגרם נשלחה לחייל" : "ℹ️ לחייל אין טלגרם מחובר"}
          </div>
          <div className="mt-5 space-y-2">
            {pdfWaUrl && (
              <a href={pdfWaUrl} target="_blank" rel="noreferrer"
                className="block w-full bg-green-600 hover:bg-green-700 text-white rounded-lg py-2.5 text-sm font-bold">
                📤 שלח תעודה (PDF) לחייל
              </a>
            )}
            {pdfUrl && (
              <a href={pdfUrl} download
                className="block w-full border border-slate-300 hover:bg-slate-50 rounded-lg py-2.5 text-sm font-medium">
                ⬇️ הורד PDF
              </a>
            )}
            {docUrl && (
              <a href={docUrl} target="_blank" rel="noreferrer"
                className="block w-full border border-slate-300 hover:bg-slate-50 rounded-lg py-2.5 text-sm">
                📄 צפייה בתעודה
              </a>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <a href="/signatures"
              className="flex-1 bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium">
              ✍️ המשך החתמות
            </a>
            <a href="/dashboard"
              className="flex-1 border border-slate-300 hover:bg-slate-50 rounded-lg px-4 py-2 text-sm font-medium">
              🏠 חזרה לראשי
            </a>
          </div>
        </div>
      </div>
    );
  }
  if (sig.status === "EXPIRED" || (sig.tokenExpires && sig.tokenExpires < new Date())) {
    return <CenteredWithRedirect title="פג תוקף" text="הקישור אינו בתוקף. פנה לאחראי." tone="error" />;
  }

  // 🔒 חתימה על נשק מהארמון — מסך-הכוונה אם חסרים שלבים מקדימים (במקום לתת להיחסם בשקט).
  //    כל שלב מציג מה חסר + לינק/הנחיה ישירה. הנוהל נחתם שוב אינליין בחתימה עצמה (כפילות מכוונת).
  if (isArmoryTransfer && sig.soldier) {
    const elig = await getSoldierWeaponsEligibility(sig.soldier.id);
    if (elig && !elig.isFullyEligible) {
      const soldierId = sig.soldier.id;
      const testUrl = sig.transfer?.fromHolder?.armoryTestUrl ?? null;
      const noholLink = `/weapons-sign/${soldierId}${linkTokenQuery("weapons-sign", soldierId)}`;
      const steps: { ok: boolean; label: string; action: { text: string; href: string; external?: boolean } | null; note: string }[] = [
        { ok: elig.enlisted, label: "גיוס", action: null, note: "פנה/י לשלישות להשלמת גיוס" },
        { ok: elig.weaponsApproved, label: "אישור מפקד לנשיאת נשק", action: null, note: "פנה/י למפקד (מג\"ד/סמג\"ד) לאישור" },
        { ok: elig.armoryTestSubmitted, label: "מבחן נוהל ארמון", action: testUrl ? { text: "📝 לביצוע המבחן", href: testUrl, external: true } : null, note: "לאחר המבחן — שלח/י צילום תוצאה בבוט (🔫 נשקייה)" },
        { ok: elig.weaponsAgreementSigned, label: "חתימה על נוהל שמירת נשק", action: { text: "✍️ חתום/י על הנוהל", href: noholLink }, note: "חתימה נפרדת חד-פעמית — לחיצה נכנסת ישר" },
      ];
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="bg-amber-500 text-white p-5 flex items-center gap-3">
              {logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="סמל הגדוד" className="w-12 h-12 object-contain bg-white/10 rounded p-1" />
              )}
              <div>
                <div className="text-xs text-amber-100">PALMY · {unitName}</div>
                <h1 className="text-lg font-bold">🔒 טרם ניתן לחתום על הנשק</h1>
                <p className="text-sm text-amber-50 mt-1">{signerName}</p>
              </div>
            </div>
            <div className="p-5 space-y-2.5">
              <p className="text-sm text-slate-600 mb-1">כדי לחתום על הנשק יש להשלים קודם את השלבים החסרים:</p>
              {steps.map((s, i) => (
                <div key={i} className={`rounded-lg border p-3 ${s.ok ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{s.ok ? "✅" : "⬜"}</span>
                    <span className={`font-bold text-sm ${s.ok ? "text-emerald-800" : "text-rose-800"}`}>{s.label}</span>
                  </div>
                  {!s.ok && (
                    <div className="mt-2 pr-7 space-y-1">
                      {s.action && (
                        <a href={s.action.href} {...(s.action.external ? { target: "_blank", rel: "noreferrer" } : {})}
                          className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5 text-sm font-medium">
                          {s.action.text}
                        </a>
                      )}
                      <p className="text-xs text-slate-500">{s.note}</p>
                    </div>
                  )}
                </div>
              ))}
              <p className="text-[11px] text-slate-400 text-center pt-2">לאחר השלמת כל השלבים — פתח/י שוב את קישור החתימה על הנשק.</p>
            </div>
          </div>
        </div>
      );
    }
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
            <div className="text-xs text-slate-300">PALMY · {unitName}</div>
            {sig.battalion?.motto && <div className="text-[11px] text-amber-300/80 italic">״{sig.battalion.motto}״</div>}
            <h1 className="text-lg font-bold">{isCompanySign ? "החתמת פלוגה" : "אישור וחתימה על ציוד"}</h1>
            <p className="text-sm text-slate-300 mt-1">
              {signerName} {signerSubtitle && <span>· {signerSubtitle}</span>}
            </p>
          </div>
        </div>

        <div className="p-5">
          <EditableItemList
            token={token}
            lines={(sig.transfer?.lines ?? []).map((l) => ({
              id: l.id,
              itemName: l.itemType.name,
              serialNumber: l.serialUnit?.serialNumber ?? null,
              lotQuantity: l.serialUnit?.lotQuantity ?? null,
              quantity: l.quantity,
              isSerial: !!l.serialUnitId,
            }))}
          />

          <SignaturePad
            token={token}
            soldierName={signerName}
            isCompanySign={isCompanySign}
            commanderApproval={commanderApproval}
            weaponsAgreement={isArmoryTransfer && sig.transfer?.fromHolder ? {
              title: WEAPONS_AGREEMENT_TITLE,
              clauses: sig.transfer.fromHolder.weaponsAgreementText
                ? sig.transfer.fromHolder.weaponsAgreementText.split("\n").filter(Boolean)
                : WEAPONS_AGREEMENT_CLAUSES.map((c, i) => `${i + 1}. ${c}`),
              footer: WEAPONS_AGREEMENT_FOOTER,
            } : undefined}
            signatureClause={sig.transfer?.fromHolder?.signatureClause ? {
              holderName: sig.transfer.fromHolder.name,
              text: sig.transfer.fromHolder.signatureClause,
            } : undefined}
          />
        </div>
      </div>
    </div>
  );
}

