"use server";

import { revalidatePath } from "next/cache";
import { requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isLang } from "@/lib/i18n";

/** Saves the staff member's app language (also used for their phone alerts). */
export async function setLanguage(lang: string) {
  const s = await requireRestaurantSession();
  if (!isLang(lang)) return;
  await db.user.update({ where: { id: s.userId }, data: { language: lang } });
  revalidatePath("/dashboard", "layout");
}
