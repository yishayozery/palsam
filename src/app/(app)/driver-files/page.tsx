import { redirect } from "next/navigation";

// תיקי הנהגים משולבים כעת במסך "קצין רכב" (טבלת הרישיונות + טאב הגדרות תיק נהג).
// אין דף/תפריט נפרד — מפנים לשם.
export default function DriverFilesIndexRedirect() {
  redirect("/driving-licenses?tab=soldiers");
}
