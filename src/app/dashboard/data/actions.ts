"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/server/approval";
import { cancelAccountDeletion, scheduleAccountDeletion } from "@/server/privacy";

export type FormState = { error?: string; ok?: string } | null;

export async function requestAccountDeletion(_: FormState, formData: FormData): Promise<FormState> {
  const s = await requireRestaurantSession(["OWNER"]);
  const [user, restaurant] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: s.userId } }),
    db.restaurant.findUniqueOrThrow({ where: { id: s.restaurantId }, select: { name: true, organizationId: true } }),
  ]);
  if (String(formData.get("confirm") ?? "").trim().toLowerCase() !== restaurant.name.trim().toLowerCase()) {
    return { error: `Type the restaurant name exactly: ${restaurant.name}` };
  }
  if (!(await bcrypt.compare(String(formData.get("password") ?? ""), user.passwordHash))) return { error: "Wrong password" };
  const at = await scheduleAccountDeletion(restaurant.organizationId);
  await audit({ restaurantId: s.restaurantId, actor: s, action: "ACCOUNT_DELETION_SCHEDULED", details: { at: at.toISOString() } });
  revalidatePath("/dashboard", "layout");
  return { ok: "Deletion scheduled" };
}

export async function undoAccountDeletion() {
  const s = await requireRestaurantSession(["OWNER"]);
  const r = await db.restaurant.findUniqueOrThrow({ where: { id: s.restaurantId }, select: { organizationId: true } });
  await cancelAccountDeletion(r.organizationId);
  await audit({ restaurantId: s.restaurantId, actor: s, action: "ACCOUNT_DELETION_CANCELLED" });
  revalidatePath("/dashboard", "layout");
}
