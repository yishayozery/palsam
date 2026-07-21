import { TERMS_TITLE, TERMS_VERSION, TERMS_SECTIONS } from "@/lib/terms";

export const metadata = { title: TERMS_TITLE };

/** דף ציבורי — נגיש גם ללא התחברות, כי מאשרים אותו לפני שיש חשבון. */
export default function TermsPage() {
  return (
    <div dir="rtl" className="min-h-[100dvh] bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-slate-800">{TERMS_TITLE}</h1>
        <p className="text-xs text-slate-400 mt-1">גרסה {TERMS_VERSION}</p>

        <div className="mt-6 space-y-6">
          {TERMS_SECTIONS.map((sec) => (
            <section key={sec.heading}>
              <h2 className="font-bold text-slate-800 mb-1.5">{sec.heading}</h2>
              {sec.body.map((para, i) => (
                <p key={i} className="text-sm text-slate-600 leading-relaxed mb-2">{para}</p>
              ))}
            </section>
          ))}
        </div>

        <p className="mt-8 pt-4 border-t border-slate-200 text-xs text-slate-400">
          PALMY · שאלות בנושא מידע אישי — דרך היחידה.
        </p>
      </div>
    </div>
  );
}
