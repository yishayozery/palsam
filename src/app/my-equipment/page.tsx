import MyEquipmentClient from "./MyEquipmentClient";

export const metadata = {
  title: "📋 מה אני חתום עליו - PALMY",
};

export default function MyEquipmentPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-6">
          <div className="mx-auto w-14 h-14 rounded-xl bg-slate-800 text-white flex items-center justify-center text-2xl mb-3">
            🪖
          </div>
          <h1 className="text-2xl font-bold text-slate-800">מה אני חתום עליו?</h1>
          <p className="text-sm text-slate-500 mt-1">
            בדיקה ציבורית - הזן שם ומספר אישי לראות את הציוד שחתום עליך
          </p>
        </div>
        <MyEquipmentClient />
      </div>
    </div>
  );
}
