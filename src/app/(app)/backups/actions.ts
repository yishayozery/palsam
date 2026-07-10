"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/guard";
import { runBackup } from "@/lib/backup";

/** גיבוי ידני מיידי (super-admin). */
export async function manualBackup() {
  await requireSuperAdmin();
  const res = await runBackup();
  revalidatePath("/backups");
  return res;
}
