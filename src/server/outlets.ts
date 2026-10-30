import "server-only";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { OrderError } from "./orders";

/** Restaurants an owner can open: every outlet in their organisation. */
export async function outletsFor(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, restaurant: { select: { organizationId: true } } } });
  if (!user?.restaurant || user.role !== "OWNER") return [];
  return db.restaurant.findMany({
    where: { organizationId: user.restaurant.organizationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, city: true, slug: true, isActive: true, plan: true, planExpiresAt: true },
  });
}

async function uniqueSlug(name: string) {
  const base = slugify(name) || "outlet";
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    if (!(await db.restaurant.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  throw new OrderError("Could not create a unique link for this outlet");
}

/** New outlet in the same organisation, copying tax, payment and customer settings from `fromId`. */
export async function createOutlet(fromId: string, input: { name: string; city: string; copyMenu: boolean }) {
  const from = await db.restaurant.findUniqueOrThrow({ where: { id: fromId } });
  const outlet = await db.restaurant.create({
    data: {
      organizationId: from.organizationId,
      name: input.name,
      city: input.city || null,
      state: from.state,
      slug: await uniqueSlug(`${input.name} ${input.city}`),
      phone: from.phone,
      whatsappNumber: from.whatsappNumber,
      email: from.email,
      logoUrl: from.logoUrl,
      fssaiNumber: null, // FSSAI licences are per premises
      gstEnabled: from.gstEnabled,
      gstin: from.gstin,
      gstMode: from.gstMode,
      defaultGstRate: from.defaultGstRate,
      serviceChargeEnabled: from.serviceChargeEnabled,
      serviceChargeRate: from.serviceChargeRate,
      invoicePrefix: from.invoicePrefix,
      upiId: from.upiId,
      upiPayeeName: from.upiPayeeName,
      razorpayKeyId: from.razorpayKeyId,
      razorpayKeySecretEnc: from.razorpayKeySecretEnc,
      acceptCash: from.acceptCash,
      acceptCard: from.acceptCard,
      menuThemeColor: from.menuThemeColor,
      requireManagerPin: from.requireManagerPin,
      loyaltyEnabled: from.loyaltyEnabled,
      loyaltyEarnPer100: from.loyaltyEarnPer100,
      loyaltyPointValue: from.loyaltyPointValue,
      loyaltyMinRedeem: from.loyaltyMinRedeem,
      birthdayOfferText: from.birthdayOfferText,
      zomatoCommission: from.zomatoCommission,
      swiggyCommission: from.swiggyCommission,
      planExpiresAt: new Date(Date.now() + 14 * 86_400_000),
      tables: { create: Array.from({ length: 6 }, (_, i) => ({ name: `T${i + 1}`, sortOrder: i })) },
    },
  });
  if (input.copyMenu) await copyMenu(fromId, outlet.id);
  return outlet;
}

/**
 * Copies categories, items, sizes and add-ons that the target doesn't have yet (matched by name).
 * Prices and availability come from the source. Recipes are not copied because stock is per outlet.
 */
export async function copyMenu(fromId: string, toId: string) {
  const [source, target] = await Promise.all([
    db.category.findMany({
      where: { restaurantId: fromId },
      orderBy: { sortOrder: "asc" },
      include: { items: { orderBy: { sortOrder: "asc" }, include: { variants: true, addonGroups: { include: { options: true } } } } },
    }),
    db.category.findMany({ where: { restaurantId: toId }, include: { items: { select: { name: true } } } }),
  ]);
  const key = (s: string) => s.trim().toLowerCase();
  let categories = 0;
  let items = 0;
  await db.$transaction(async (tx) => {
    let nextSort = target.length;
    for (const cat of source) {
      let dest = target.find((c) => key(c.name) === key(cat.name));
      if (!dest) {
        dest = { ...(await tx.category.create({ data: { restaurantId: toId, name: cat.name, description: cat.description, sortOrder: nextSort++ } })), items: [] };
        categories++;
      }
      const existing = new Set(dest.items.map((i) => key(i.name)));
      for (const item of cat.items) {
        if (existing.has(key(item.name))) continue;
        await tx.menuItem.create({
          data: {
            restaurantId: toId,
            categoryId: dest.id,
            name: item.name,
            description: item.description,
            price: item.price,
            imageUrl: item.imageUrl,
            foodType: item.foodType,
            gstRate: item.gstRate,
            isAvailable: item.isAvailable,
            isBestseller: item.isBestseller,
            spiceLevel: item.spiceLevel,
            prepTimeMinutes: item.prepTimeMinutes,
            sortOrder: item.sortOrder,
            variants: { create: item.variants.map((v) => ({ name: v.name, price: v.price, sortOrder: v.sortOrder })) },
            addonGroups: {
              create: item.addonGroups.map((g) => ({
                name: g.name,
                minSelect: g.minSelect,
                maxSelect: g.maxSelect,
                sortOrder: g.sortOrder,
                options: { create: g.options.map((o) => ({ name: o.name, price: o.price, sortOrder: o.sortOrder })) },
              })),
            },
          },
        });
        items++;
      }
    }
  });
  return { categories, items };
}
