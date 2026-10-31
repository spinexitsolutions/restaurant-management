"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { ALLOWED_GST, MAX_IMPORT_ROWS, type ParseResult } from "@/lib/menu-import";
import { audit } from "@/server/approval";
import { aiImportEnabled, importMenuRows, readMenuPhotos } from "@/server/menu-import";

const rowSchema = z.object({
  category: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(80),
  price: z.number().min(0).max(1_000_000),
  foodType: z.enum(["VEG", "NON_VEG", "EGG"]),
  gstRate: z.number().refine((n) => ALLOWED_GST.includes(n)).nullable(),
  description: z.string().max(300).nullable(),
  variants: z.array(z.object({ name: z.string().trim().min(1).max(40), price: z.number().min(0).max(1_000_000) })).max(20),
  isAvailable: z.boolean(),
  isBestseller: z.boolean(),
});

export async function importMenu(rows: unknown, mode: "add" | "update") {
  const s = await requireRestaurantSession(MANAGE_ROLES);
  const parsed = z.array(rowSchema).min(1, "Nothing to import").max(MAX_IMPORT_ROWS).safeParse(rows);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const counts = await importMenuRows(s.restaurantId, parsed.data, mode === "update" ? "update" : "add");
  await audit({ restaurantId: s.restaurantId, actor: s, action: "MENU_IMPORTED", details: { ...counts, mode } });
  revalidatePath("/dashboard/menu");
  return { ok: true as const, counts };
}

const imageSchema = z
  .array(
    z.object({
      mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      data: z.string().min(100).max(2_500_000), // base64, resized in the browser
    }),
  )
  .min(1, "Add a photo of the menu")
  .max(5, "Up to 5 photos at a time");

export async function readMenuFromPhotos(images: unknown): Promise<{ ok: true; result: ParseResult } | { ok: false; error: string }> {
  await requireRestaurantSession(MANAGE_ROLES);
  if (!aiImportEnabled()) return { ok: false, error: "Photo import isn't set up on this server (ANTHROPIC_API_KEY missing)." };
  const parsed = imageSchema.safeParse(images);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    return { ok: true, result: await readMenuPhotos(parsed.data) };
  } catch (e) {
    console.error("menu photo import failed", e);
    return { ok: false, error: "Couldn't read the photos right now. Please try again." };
  }
}
