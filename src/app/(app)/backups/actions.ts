"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/guard";
import { runBackup } from "@/lib/backup";

/** גיבוי ידני מיידי (super-admin). force — עוקף את מניעת-הכפילות של ה-cron; לחיצה מפורשת תמיד רצה. */
export async function manualBackup() {
  await requireSuperAdmin();
  const res = await runBackup({ force: true });
  revalidatePath("/backups");
  return res;
}
