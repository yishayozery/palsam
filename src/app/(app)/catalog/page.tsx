import { redirect } from "next/navigation";

export default function CatalogRedirectPage() {
  redirect("/items?tab=items");
}
