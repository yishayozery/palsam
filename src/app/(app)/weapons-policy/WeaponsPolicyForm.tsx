"use client";

import { useActionState } from "react";
import { updateWeaponsPolicy, type WpState } from "./actions";

const initial: WpState = {};

type Props = {
  policy: {
    requireEnlistment: boolean;
    requireWeaponsApproval: boolean;
    requireArmoryTest: boolean;
    requireWeaponsAgreement: boolean;
  };
};

const STEPS = [
  {
    name: "requireEnlistment",
    label: "אישור שלישות (שלב 1)",
    desc: "החייל חייב להיות משולש (סטטוס ENLISTED) לפני חתימה על נשק. השלישות מאושרת ע\"י השליש.",
  },
  {
    name: "requireWeaponsApproval",
    label: "אישור מג\"ד / סמג\"ד (שלב 2)",
    desc: "מפקד הגדוד או סגנו חייבים לאשר את החייל לחימוש. האישור כולל חתימה דיגיטלית.",
  },
  {
    name: "requireArmoryTest",
    label: "מבחן נוהל ארמון (שלב 3)",
    desc: "החייל חייב לעבור מבחן בטיחות ולהעלות צילום מסך של התוצאה. הלינק למבחן מוגדר בהגדרות תפעול.",
  },
  {
    name: "requireWeaponsAgreement",
    label: "חתימה על נוהל שמירת נשק (שלב 4)",
    desc: "החייל חייב לחתום על נוהל בטיחות נשק. החתימה מתבצעת אוטומטית בהחתמה הראשונה, או ידנית דרך לינק.",
  },
] as const;

export default function WeaponsPolicyForm({ policy }: Props) {
  const [state, formAction, pending] = useActionState(updateWeaponsPolicy, initial);

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-slate-600 mb-4">
        סמן את השלבים שהגדוד מחייב לפני שהארמון יכול להחתים חייל על נשק.
        שלב שלא מסומן — לא ייבדק, וחיילים יוכלו לקבל נשק בלעדיו.
      </p>

      {STEPS.map((step) => (
        <label
          key={step.name}
          className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-slate-50 border border-slate-200"
        >
          <input
            type="checkbox"
            name={step.name}
            defaultChecked={policy[step.name as keyof typeof policy]}
            className="mt-0.5"
          />
          <div>
            <div className="font-medium text-sm text-slate-800">{step.label}</div>
            <div className="text-xs text-slate-500 mt-0.5">{step.desc}</div>
          </div>
        </label>
      ))}

      <div className="flex items-center justify-end gap-3 pt-2">
        {state.ok && <span className="text-sm text-emerald-600">נשמר ✓</span>}
        {state.error && <span className="text-sm text-rose-600">{state.error}</span>}
        <button
          type="submit"
          disabled={pending}
          className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white rounded-lg px-5 py-2 text-sm font-medium"
        >
          {pending ? "שומר..." : "שמירה"}
        </button>
      </div>
    </form>
  );
}
