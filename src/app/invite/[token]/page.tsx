import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/rbac";
import SetPasswordForm from "./SetPasswordForm";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await prisma.appUser.findUnique({
    where: { inviteToken: token },
    include: { battalion: true, holder: true, systemRole: true },
  });

  if (!user || !user.active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-sm">
          <h1 className="text-xl font-bold text-slate-800">קישור לא תקין</h1>
          <p className="text-sm text-slate-500 mt-2">ההזמנה אינה קיימת או שכבר נוצלה. פנה למנהל המערכת.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8 relative">
        {user.battalion?.logoData && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={user.battalion.logoData} alt="" className="object-contain" style={{ width: 420, height: 420, opacity: 0.08 }} />
          </div>
        )}
        <div className="text-center mb-6 relative z-10">
          {user.battalion?.logoData ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.battalion.logoData} alt="סמל" className="mx-auto w-14 h-14 object-contain mb-3" />
          ) : (
            <div className="mx-auto w-14 h-14 rounded-xl bg-slate-800 text-white flex items-center justify-center text-2xl mb-3">🛡️</div>
          )}
          <h1 className="text-lg font-bold text-slate-800">ברוך הבא, {user.fullName}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {user.battalion?.name} · {user.systemRole?.name || ROLE_LABELS[user.role]}
            {user.holder ? ` · ${user.holder.name}` : ""}
          </p>
          <p className="text-xs text-slate-400 mt-2">הגדר סיסמה לכניסה הראשונה למערכת</p>
        </div>
        <div className="relative z-10">
          <SetPasswordForm token={token} username={user.username} />
        </div>
      </div>
    </div>
  );
}
