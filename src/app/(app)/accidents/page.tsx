import { redirect } from "next/navigation";

// דיווחי התאונה עברו לתוך מסך "קצין רכב" (טאב). מפנים לשם — מקור יחיד.
export default function AccidentsRedirect() {
  redirect("/driving-licenses?tab=accidents");
}
