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
      session: { select: { id: true, status: true } },
      battalion: { select: { name: true, logoData: true } },
      items: {
        select: {
          id: true,
          itemTypeName: true,
          serialNumber: true,
          status: true,
          photoData: true,
          note: true,
        },
      },
    },
  });
  if (!req) notFound();

  const alreadyDone = !!req.respondedAt;

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
            <p className="text-sm text-slate-700 mt-2 font-medium">
              {req.soldier.fullName}
              {req.soldier.personalNumber && (
                <span className="text-slate-400 mr-1">({req.soldier.personalNumber})</span>
              )}
            </p>
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
            <VerificationClient token={token} items={req.items} soldierName={req.soldier.fullName} />
          )}
        </div>
      </div>
    </div>
  );
}
