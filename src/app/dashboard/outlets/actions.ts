"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRestaurantSession, refreshSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/server/approval";
import { copyMenu, createOutlet, outletsFor } from "@/server/outlets";

export type FormState = { error?: string; ok?: string } | null;

async function ownerWithOutlets() {
  const s = await requireRestaurantSession(["OWNER"]);
  const outlets = await outletsFor(s.userId);
  return { s, outlets, ids: new Set(outlets.map((o) => o.id)) };
}

/** Owners move between their organisation's outlets; the session is re-issued for the new outlet. */
export async function switchOutlet(restaurantId: string) {
  const { s, ids } = await ownerWithOutlets();
  if (!ids.has(restaurantId)) return;
  const user = await db.user.update({ where: { id: s.userId }, data: { restaurantId } });
  await refreshSession(user);
  redirect("/dashboard");
}

const outletSchema = z.object({
  name: z.string().trim().min(2, "Enter the outlet name").max(80),
  city: z.string().trim().max(60),
  copyMenu: z.boolean(),
});

export async function addOutlet(_: FormState, formData: FormData): Promise<FormState> {
  const { s } = await ownerWithOutlets();
  const parsed = outletSchema.safeParse({ name: formData.get("name"), city: formData.get("city") ?? "", copyMenu: formData.get("copyMenu") === "on" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const outlet = await createOutlet(s.restaurantId, parsed.data);
  await audit({ restaurantId: s.restaurantId, actor: s, action: "OUTLET_CREATED", details: { outlet: outlet.name } });
  revalidatePath("/dashboard", "layout");
  return { ok: `${outlet.name} created. Switch to it to add tables, staff and set its own UPI/FSSAI details.` };
}

export async function copyMenuBetween(_: FormState, formData: FormData): Promise<FormState> {
  const { s, ids } = await ownerWithOutlets();
  const from = String(formData.get("from"));
  const to = String(formData.get("to"));
  if (!ids.has(from) || !ids.has(to)) return { error: "Pick two of your outlets" };
  if (from === to) return { error: "Pick two different outlets" };
  const res = await copyMenu(from, to);
  await audit({ restaurantId: to, actor: s, action: "MENU_COPIED", details: { from, ...res } });
  revalidatePath("/dashboard", "layout");
  return { ok: `Copied ${res.items} item(s) and ${res.categories} new categor${res.categories === 1 ? "y" : "ies"}. Items already present were left unchanged.` };
}
