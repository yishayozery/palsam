export default function AboutPage() {
  const areas = [
    { icon: "📦", title: "מלאי סריאלי וכמותי", desc: "מעקב אחר כל הציוד הגדודי — לפי מספר סריאלי, כמות ואצוות. מחסנים, פלוגות, חיילים." },
    { icon: "✍️", title: "החתמות דיגיטליות", desc: "החתמת חיילים ופלוגות על ציוד עם חתימה דיגיטלית — QR, וואטסאפ או שרבוט." },
    { icon: "🪖", title: "שלישות", desc: "ניהול חיילי הגדוד — סטטוסים, שיוך לפלוגות ומחלקות, גיוס ושחרור." },
    { icon: "📋", title: "נוכחות חיילים", desc: "דיווח נוכחות יומי לפי פלוגה ומחלקה. תוכנית עבודה וביצוע בפועל." },
    { icon: "🔫", title: "זכאות לנשק", desc: "תהליך אישור חייל לנשק — אישור מפקד, מבחן ארמון, נוהל שמירה." },
    { icon: "🔢", title: "ספירות מלאי", desc: "תכניות ספירה תקופתיות, השוואה אוטומטית לרשום, זיהוי פערים." },
    { icon: "🔧", title: "תחזוקה (טנא)", desc: "שליחת ציוד תקול, מעקב סטטוס תיקון, החזרה אוטומטית." },
    { icon: "🚗", title: 'שבצ"ק', desc: "שיבוץ רכבים לנהגים ומשימות, שיתוף בוואטסאפ." },
    { icon: "📈", title: "דוחות", desc: "תמונת מצב מלאי, היסטוריית תעודות, יומן פעולות, ייצוא לאקסל." },
    { icon: "🏪", title: "מבנה ארגוני", desc: "מחסנים, פלוגות, מחלקות, משתמשים — לכל יחידה." },
    { icon: "📦", title: "הקצאות וציוד קבוע", desc: "הגבלת כמות ציוד לפלוגה, הגדרת baseline שנשאר גם במבצע." },
    { icon: "🎁", title: "תרומות", desc: "ציוד לא-צה\"לי שנכנס לפלוגה/מחסן, מנוהל בנפרד." },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-950 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 rounded-xl bg-white/10 text-white flex items-center justify-center text-3xl mb-4">
            🛡️
          </div>
          <h1 className="text-3xl font-bold text-white tracking-wide">PALSAM</h1>
          <p className="text-slate-300 mt-2 text-lg">מערכת ניהול מלאי גדודי</p>
          <p className="text-slate-400 mt-1 text-sm">שרשרת אספקה, החתמות, נוכחות ובקרה — במקום אחד</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
          {areas.map((a) => (
            <div key={a.title} className="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{a.icon}</span>
                <h3 className="font-bold text-sm text-white">{a.title}</h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{a.desc}</p>
            </div>
          ))}
        </div>

        <div className="bg-white/10 backdrop-blur rounded-xl p-6 border border-white/10 mb-6">
          <h2 className="font-bold text-white text-lg mb-3">תפקידים במערכת</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { icon: "🛡️", role: 'מפ"מ', desc: "אחראי מערכת — גישה מלאה, הקמת מבנה ומשתמשים" },
              { icon: "⭐", role: 'מג"ד / סמג"ד', desc: "צפייה מלאה + אישור חיילים לנשק" },
              { icon: "🏪", role: "קצין מחסן", desc: "תפעול מחסן — קליטה, ניפוק, החתמות, ספירות" },
              { icon: "🪖", role: 'רס"פ פלוגה', desc: "ניהול ציוד פלוגתי — חיילים, החתמות, נוכחות" },
              { icon: "📋", role: "שליש גדודי", desc: "ניהול חיילים — גיוס, שחרור, שלישות" },
              { icon: "👁️", role: "צופה", desc: "צפייה בלבד — דשבורד ודוחות" },
            ].map((r) => (
              <div key={r.role} className="flex items-start gap-2 bg-white/5 rounded-lg p-3">
                <span className="text-lg">{r.icon}</span>
                <div>
                  <div className="text-sm font-bold text-white">{r.role}</div>
                  <div className="text-xs text-slate-300">{r.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center">
          <a href="/login" className="inline-block bg-white text-slate-800 font-bold rounded-lg px-6 py-3 hover:bg-slate-100 transition">
            כניסה למערכת
          </a>
          <p className="text-xs text-slate-500 mt-4">
            לקבלת גישה — פנה למפ״מ של הגדוד שלך
          </p>
        </div>
      </div>
    </div>
  );
}
