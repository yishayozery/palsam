import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyLink } from "@/lib/link-token";
import SignForm from "./SignForm";

export const dynamic = "force-dynamic";

export default async function FuelSignPage({ params, searchParams }: { params: Promise<{ cardId: string }>; searchParams: Promise<{ t?: string }> }) {
  const { cardId } = await params;
  const { t: tok } = await searchParams;
  if (!verifyLink("fuel-sign", cardId, tok)) notFound();

  const card = await prisma.vehicleFuelCard.findUnique({
    where: { id: cardId },
    select: { cardNumber: true, signedAt: true, checkoutAt: true, soldier: { select: { fullName: true, personalNumber: true } }, battalion: { select: { name: true, logoData: true } } },
  });
  if (!card) notFound();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-950 p-3" dir="rtl">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl p-5 my-4">
        <div className="text-center mb-4">
          {card.battalion.logoData
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={card.battalion.logoData} alt="" className="mx-auto w-12 h-12 object-contain mb-2" />
            : <div className="mx-auto w-12 h-12 rounded-xl bg-slate-800 text-white flex items-center justify-center text-xl mb-2">⛽</div>}
          <h1 className="text-lg font-bold text-slate-800">קבלת כרטיס דלק</h1>
          <p className="text-xs text-slate-500">{card.battalion.name}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-700 mb-4 space-y-1">
          <div><b>{card.soldier.fullName}</b> · מ.א {card.soldier.personalNumber ?? "—"}</div>
          <div>מספר כרטיס: <b className="font-mono">{card.cardNumber}</b></div>
        </div>
        {card.signedAt ? (
          <div className="text-center py-6"><div className="text-5xl mb-2">✅</div><p className="font-bold text-emerald-700">כבר נחתם. תודה!</p></div>
        ) : (
          <SignForm cardId={cardId} token={tok ?? ""} soldierName={card.soldier.fullName} />
        )}
      </div>
    </div>
  );
}
