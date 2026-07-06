"use client";

/** כפתור ווטסאפ תמיכה צף — מופיע בכל המסכים (מוזרק מה-layout כשמוגדר מספר). */
export default function FloatingWhatsApp({ number }: { number: string }) {
  const href = `https://wa.me/${number}?text=${encodeURIComponent("שלום, אני צריך עזרה במערכת PALMY")}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title="עזרה בוואטסאפ"
      aria-label="עזרה בוואטסאפ"
      className="fixed bottom-4 left-4 z-40 flex items-center justify-center w-13 h-13 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-2xl shadow-lg shadow-emerald-500/30 transition hover:scale-105"
      style={{ width: 52, height: 52 }}
    >
      💬
    </a>
  );
}
