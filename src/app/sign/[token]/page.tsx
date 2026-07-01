import { prisma } from "@/lib/prisma";
import SignaturePad from "./SignaturePad";
import EditableItemList from "./EditableItemList";
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
    const docUrl = sig.transferId ? `${base}/transfer-doc/${sig.transferId}` : null;
    const soldierPhone = sig.soldier?.phone ?? sig.signerUser?.phone ?? null;
    const certWaText = docUrl
      ? encodeURIComponent(`שלום ${signerName}, מצורף אישור החתמת ציוד:\n${docUrl}`)
      : null;
    const certWaUrl = certWaText && soldierPhone
      ? `https://wa.me/${soldierPhone.replace(/\D/g, "").replace(/^0/, "972")}?text=${certWaText}`
      : certWaText
        ? `https://wa.me/?text=${certWaText}`
        : null;

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
          <div className="mt-5 space-y-2">
            {certWaUrl && (
              <a href={certWaUrl} target="_blank" rel="noreferrer"
                className="block w-full bg-green-600 hover:bg-green-700 text-white rounded-lg py-2.5 text-sm font-bold">
                📲 שלח תעודה לחייל
              </a>
            )}
            {docUrl && (
              <a href={docUrl} target="_blank" rel="noreferrer"
                className="block w-full bg-slate-800 hover:bg-slate-900 text-white rounded-lg py-2.5 text-sm font-bold">
                📄 צפייה בתעודה
              </a>
            )}
          </div>
        </div>
      </div>
    );
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

