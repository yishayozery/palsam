import { redirect } from "next/navigation";

export default function DictionariesRedirectPage() {
  redirect("/items?tab=categories");
}
