import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import VerificationClient from "./VerificationClient";

export const dynamic = "force-dynamic";

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const req = await prisma.verificationRequest.findUnique({
    where: { token },
    include: {
      soldier: { select: { fullName: true, personalNumber: true } },
      holder: { select: { name: true } },
      session: { select: { id: true, status: true, correctByReporter: true } },
      battalion: {
        select: {
          name: true,
          logoData: true,
          holders: {
            where: { active: true },
            select: {
              equipmentLocations: {
                where: { active: true },
                select: { id: true, name: true },
              },
            },
          },
        },
      },
      items: {
        select: {
          id: true,
          itemTypeName: true,
          serialNumber: true,
          status: true,
          photoData: true,
          note: true,
          expectedQuantity: true,
          reportedQuantity: true,
          reportedSerial: true,
          reportedLocation: true,
          expectedExpiry: true,
        },
      },
    },
  });
  if (!req) notFound();

  // אם הספירה מאפשרת תיקון ע"י המדווח — לא חוסמים אחרי דיווח (ניתן לפתוח ולתקן)
  const alreadyDone = !!req.respondedAt && !req.session?.correctByReporter;
  const name = req.soldier?.fullName || req.holder?.name || "";
  const subtitle = req.soldier?.personalNumber
    ? `${name} (${req.soldier.personalNumber})`
    : name;

  // Flatten equipment locations for LOCATION mode
  const locations = req.battalion.holders
    .flatMap((h) => h.equipmentLocations)
    .map((el) => ({ id: el.id, name: el.name }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-950 p-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <div className="text-center mb-6">
            {req.battalion.logoData && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={req.battalion.logoData} alt="" className="mx-auto w-14 h-14 object-contain mb-3" />
            )}
            <h1 className="text-lg font-bold text-slate-800">אימות ציוד</h1>
            <p className="text-sm text-slate-500">{req.battalion.name}</p>
            <p className="text-sm text-slate-700 mt-2 font-medium">{subtitle}</p>
          </div>

          {alreadyDone ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-3">✅</div>
              <p className="font-bold text-emerald-700">הדיווח נקלט בהצלחה</p>
              <p className="text-sm text-slate-500 mt-2">
                דווח ב-{req.respondedAt!.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}
              </p>
            </div>
          ) : (
            <VerificationClient
              token={token}
              items={req.items.map((it) => ({ ...it, expectedExpiry: it.expectedExpiry ? it.expectedExpiry.toISOString().slice(0, 10) : null }))}
              soldierName={name}
              mode={req.mode}
              locations={locations}
            />
          )}
        </div>
      </div>
    </div>
  );
}
