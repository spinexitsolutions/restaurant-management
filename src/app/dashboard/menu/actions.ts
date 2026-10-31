"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseVideoUrl } from "@/lib/media";
import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";

export type FormState = { error?: string; ok?: string } | null;

const money = z.coerce.number().min(0, "Price can't be negative").max(1_000_000);

export async function createCategory(_: FormState, formData: FormData): Promise<FormState> {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const name = z.string().trim().min(1, "Enter a category name").max(60).safeParse(formData.get("name"));
  if (!name.success) return { error: name.error.issues[0].message };

  const last = await db.category.findFirst({ where: { restaurantId }, orderBy: { sortOrder: "desc" } });
  await db.category.create({ data: { restaurantId, name: name.data, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  revalidatePath("/dashboard/menu");
  return { ok: "Category added" };
}

export async function renameCategory(id: string, name: string) {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const parsed = z.string().trim().min(1).max(60).parse(name);
  await db.category.updateMany({ where: { id, restaurantId }, data: { name: parsed } });
  revalidatePath("/dashboard/menu");
}

export async function toggleCategory(id: string) {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const cat = await db.category.findFirst({ where: { id, restaurantId } });
  if (!cat) return;
  await db.category.update({ where: { id }, data: { isActive: !cat.isActive } });
  revalidatePath("/dashboard/menu");
}

export async function moveCategory(id: string, direction: "up" | "down") {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const cats = await db.category.findMany({ where: { restaurantId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const i = cats.findIndex((c) => c.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= cats.length) return;
  [cats[i], cats[j]] = [cats[j], cats[i]];
  await db.$transaction(cats.map((c, idx) => db.category.update({ where: { id: c.id }, data: { sortOrder: idx } })));
  revalidatePath("/dashboard/menu");
}

export async function deleteCategory(id: string): Promise<FormState> {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const count = await db.menuItem.count({ where: { categoryId: id, restaurantId } });
  if (count > 0) return { error: "Move or delete the items in this category first." };
  await db.category.deleteMany({ where: { id, restaurantId } });
  revalidatePath("/dashboard/menu");
  return { ok: "Category deleted" };
}

const itemSchema = z.object({
  id: z.string().optional(),
  categoryId: z.string().min(1, "Choose a category"),
  name: z.string().trim().min(1, "Enter the item name").max(80),
  description: z.string().trim().max(300).optional().default(""),
  price: money,
  imageUrl: z.union([z.literal(""), z.string().trim().regex(/^\/api\/images\/[a-z0-9]+$/), z.string().trim().url("Image must be a valid URL")]).optional().default(""),
  foodType: z.enum(["VEG", "NON_VEG", "EGG"]),
  gstRate: z.union([z.literal(""), z.coerce.number().min(0).max(28)]).optional().default(""),
  isAvailable: z.boolean(),
  isBestseller: z.boolean(),
  isKidsFriendly: z.boolean().optional().default(false),
  gallery: z
    .array(z.union([z.string().trim().regex(/^\/api\/images\/[a-z0-9]+$/), z.string().trim().url()]))
    .max(4, "Up to 4 extra photos")
    .optional()
    .default([]),
  videoUrl: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine((s) => !s || parseVideoUrl(s) !== null, "Video must be a YouTube link or an https .mp4 / .webm link"),
  pairsWith: z.array(z.string()).max(6, "Pick up to 6 dishes to suggest").optional().default([]),
  spiceLevel: z.coerce.number().int().min(0).max(3),
  stationId: z.string().optional().default(""),
  prepTimeMinutes: z.union([z.literal(""), z.coerce.number().int().min(1).max(240)]).optional().default(""),
  variants: z.array(z.object({ name: z.string().trim().min(1, "Variant name is required").max(40), price: money })).max(10),
  addonGroups: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Add-on group name is required").max(60),
        minSelect: z.coerce.number().int().min(0).max(20),
        maxSelect: z.coerce.number().int().min(1).max(20),
        options: z
          .array(z.object({ name: z.string().trim().min(1, "Add-on name is required").max(60), price: money }))
          .min(1, "Each add-on group needs at least one option")
          .max(30),
      }),
    )
    .max(10),
});

export type ItemInput = z.input<typeof itemSchema>;

export async function saveItem(input: ItemInput): Promise<FormState> {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  for (const g of d.addonGroups) {
    if (g.minSelect > g.maxSelect) return { error: `"${g.name}": minimum can't be more than maximum` };
    if (g.minSelect > g.options.length) return { error: `"${g.name}": minimum is more than the number of options` };
  }

  const category = await db.category.findFirst({ where: { id: d.categoryId, restaurantId } });
  if (!category) return { error: "Category not found" };
  if (d.pairsWith.length && (await db.menuItem.count({ where: { id: { in: d.pairsWith }, restaurantId } })) !== new Set(d.pairsWith).size) {
    return { error: "A suggested dish wasn't found" };
  }
  if (d.stationId && !(await db.kitchenStation.findFirst({ where: { id: d.stationId, restaurantId } }))) return { error: "Kitchen station not found" };

  const fields = {
    categoryId: d.categoryId,
    name: d.name,
    description: d.description || null,
    price: d.variants.length ? Math.min(...d.variants.map((v) => v.price)) : d.price,
    imageUrl: d.imageUrl || null,
    foodType: d.foodType,
    gstRate: d.gstRate === "" ? null : d.gstRate,
    isAvailable: d.isAvailable,
    isBestseller: d.isBestseller,
    isKidsFriendly: d.isKidsFriendly,
    pairsWith: d.pairsWith.filter((id) => id !== d.id),
    spiceLevel: d.spiceLevel,
    stationId: d.stationId || null,
    prepTimeMinutes: d.prepTimeMinutes === "" ? null : d.prepTimeMinutes,
  };
  const media = [
    ...d.gallery.map((url, i) => ({ kind: "IMAGE", url, sortOrder: i })),
    ...(d.videoUrl ? [{ kind: "VIDEO", url: d.videoUrl, sortOrder: 99 }] : []),
  ];
  const nested = {
    media: { create: media },
    variants: { create: d.variants.map((v, i) => ({ ...v, sortOrder: i })) },
    addonGroups: {
      create: d.addonGroups.map((g, i) => ({
        name: g.name,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        sortOrder: i,
        options: { create: g.options.map((o, j) => ({ ...o, sortOrder: j })) },
      })),
    },
  };

  if (d.id) {
    const existing = await db.menuItem.findFirst({ where: { id: d.id, restaurantId } });
    if (!existing) return { error: "Item not found" };
    await db.$transaction([
      db.itemVariant.deleteMany({ where: { menuItemId: d.id } }),
      db.itemMedia.deleteMany({ where: { menuItemId: d.id } }),
      db.addonGroup.deleteMany({ where: { menuItemId: d.id } }),
      db.menuItem.update({ where: { id: d.id }, data: { ...fields, ...nested } }),
    ]);
  } else {
    const last = await db.menuItem.findFirst({ where: { categoryId: d.categoryId }, orderBy: { sortOrder: "desc" } });
    await db.menuItem.create({ data: { restaurantId, ...fields, ...nested, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  }

  revalidatePath("/dashboard/menu");
  redirect(`/dashboard/menu?c=${d.categoryId}`);
}

export async function toggleItemAvailability(id: string) {
  const { restaurantId } = await requireRestaurantSession();
  // Any staff member can mark an item sold out, not just managers.
  const item = await db.menuItem.findFirst({ where: { id, restaurantId } });
  if (!item) return;
  await db.menuItem.update({ where: { id }, data: { isAvailable: !item.isAvailable } });
  revalidatePath("/dashboard/menu");
}

export async function deleteItem(id: string) {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  await db.menuItem.deleteMany({ where: { id, restaurantId } });
  revalidatePath("/dashboard/menu");
}
