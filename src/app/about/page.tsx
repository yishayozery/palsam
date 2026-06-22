export default function AboutPage() {
  const topics = [
    {
      group: "ניהול מלאי",
      items: [
        { icon: "📦", title: "מלאי סריאלי וכמותי", desc: "מעקב אחר כל הציוד — לפי מספר סריאלי, כמות ואצוות. מחסנים, פלוגות, חיילים." },
        { icon: "✍️", title: "החתמות דיגיטליות", desc: "החתמת חיילים ופלוגות על ציוד עם חתימה דיגיטלית — QR, וואטסאפ או שרבוט." },
        { icon: "🔢", title: "ספירות מלאי", desc: "תכניות ספירה תקופתיות, השוואה אוטומטית לרשום, זיהוי פערים." },
        { icon: "📦", title: "הקצאות וציוד קבוע", desc: "הגבלת כמות ציוד לפלוגה, הגדרת baseline שנשאר גם במבצע." },
      ],
    },
    {
      group: "כוח אדם",
      items: [
        { icon: "🪖", title: "שלישות", desc: "ניהול חיילי הגדוד — סטטוסים, שיוך לפלוגות ומחלקות, גיוס ושחרור." },
        { icon: "📋", title: "נוכחות חיילים", desc: "דיווח נוכחות יומי לפי פלוגה ומחלקה. תוכנית עבודה וביצוע בפועל." },
        { icon: "🔫", title: "זכאות לנשק", desc: "תהליך אישור חייל לנשק — אישור מפקד, מבחן ארמון, נוהל שמירה." },
      ],
    },
    {
      group: "לוגיסטיקה",
      items: [
        { icon: "🔧", title: "תחזוקה (טנא)", desc: "שליחת ציוד תקול, מעקב סטטוס תיקון, החזרה אוטומטית." },
        { icon: "🚗", title: 'שבצ"ק', desc: "שיבוץ רכבים לנהגים ומשימות, שיתוף בוואטסאפ." },
        { icon: "🎁", title: "תרומות", desc: 'ציוד לא-צה"לי שנכנס לפלוגה/מחסן, מנוהל בנפרד.' },
      ],
    },
    {
      group: "בקרה וניהול",
      items: [
        { icon: "🏪", title: "מבנה ארגוני", desc: "מחסנים, פלוגות, מחלקות, משתמשים — לכל יחידה." },
        { icon: "📈", title: "דוחות והיסטוריה", desc: "תמונת מצב מלאי, היסטוריית תעודות, יומן פעולות, ייצוא לאקסל." },
      ],
    },
  ];

  const roles = [
    { icon: "🛡️", role: 'מפ"מ', desc: "אחראי מערכת — גישה מלאה, הקמת מבנה ומשתמשים" },
    { icon: "⭐", role: 'מג"ד / סמג"ד', desc: "צפייה מלאה + אישור חיילים לנשק" },
    { icon: "🏪", role: "קצין מחסן", desc: "תפעול מחסן — קליטה, ניפוק, החתמות, ספירות" },
    { icon: "🪖", role: 'רס"פ פלוגה', desc: "ניהול ציוד פלוגתי — חיילים, החתמות, נוכחות" },
    { icon: "📋", role: "שליש גדודי", desc: "ניהול חיילים — גיוס, שחרור, שלישות" },
    { icon: "👁️", role: "צופה", desc: "צפייה בלבד — דשבורד ודוחות" },
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="text-center pt-10 pb-8 px-4">
        <div className="mx-auto w-16 h-16 rounded-xl bg-white/10 flex items-center justify-center text-3xl mb-4">
          🛡️
        </div>
        <h1 className="text-3xl font-bold tracking-wide">PALSAM</h1>
        <p className="text-slate-300 mt-2 text-lg">מערכת ניהול מלאי גדודי</p>
        <p className="text-slate-500 mt-1 text-sm">שרשרת אספקה, החתמות, נוכחות ובקרה — במקום אחד</p>
      </div>

      {/* Topics by group */}
      <div className="max-w-4xl mx-auto px-4 pb-6 space-y-6">
        {topics.map((t) => (
          <div key={t.group}>
            <h2 className="text-sm font-bold text-slate-400 mb-2 border-b border-slate-700 pb-1">{t.group}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {t.items.map((a) => (
                <div key={a.title} className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-lg">{a.icon}</span>
                    <h3 className="font-bold text-xs">{a.title}</h3>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{a.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Roles */}
      <div className="max-w-4xl mx-auto px-4 pb-8">
        <h2 className="text-sm font-bold text-slate-400 mb-2 border-b border-slate-700 pb-1">תפקידים במערכת</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
          {roles.map((r) => (
            <div key={r.role} className="flex items-start gap-2 bg-slate-800 rounded-lg p-3 border border-slate-700">
              <span className="text-lg mt-0.5">{r.icon}</span>
              <div>
                <div className="text-sm font-bold">{r.role}</div>
                <div className="text-[11px] text-slate-400">{r.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="text-center pb-10">
        <a href="/login" className="inline-block bg-white text-slate-900 font-bold rounded-lg px-6 py-3 hover:bg-slate-200 transition">
          כניסה למערכת
        </a>
        <p className="text-xs text-slate-600 mt-3">
          לקבלת גישה — פנה למפ״מ של הגדוד שלך
        </p>
      </div>
    </div>
  );
}
