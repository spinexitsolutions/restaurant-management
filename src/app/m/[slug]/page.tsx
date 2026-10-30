import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { toPaise } from "@/lib/gst";
import { MenuApp, type MenuData } from "./menu-app";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> };

async function load(slug: string) {
  return db.restaurant.findUnique({
    where: { slug },
    include: {
      categories: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          items: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            include: {
              variants: { orderBy: { sortOrder: "asc" } },
              addonGroups: { orderBy: { sortOrder: "asc" }, include: { options: { orderBy: { sortOrder: "asc" } } } },
            },
          },
        },
      },
    },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const r = await db.restaurant.findUnique({ where: { slug }, select: { name: true, city: true } });
  return { title: r ? `${r.name} Menu` : "Menu", description: r ? `Menu of ${r.name}${r.city ? `, ${r.city}` : ""}` : undefined };
}

export default async function CustomerMenuPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { t } = await searchParams;
  const r = await load(slug);
  if (!r) notFound();
  if (!r.isActive) {
    return <p className="p-10 text-center text-stone-500">This menu is currently unavailable.</p>;
  }
  const table = t ? await db.diningTable.findFirst({ where: { qrToken: t, restaurantId: r.id }, select: { name: true } }) : null;
  const defaultRate = Number(r.defaultGstRate);

  const data: MenuData = {
    restaurant: {
      slug: r.slug,
      name: r.name,
      logoUrl: r.logoUrl,
      address: [r.address, r.city].filter(Boolean).join(", "),
      themeColor: r.menuThemeColor,
      whatsappNumber: r.whatsappOrderingEnabled ? r.whatsappNumber : null,
      gstEnabled: r.gstEnabled,
      gstMode: r.gstMode,
      serviceChargeRate: r.serviceChargeEnabled ? Number(r.serviceChargeRate) : 0,
    },
    table: table?.name ?? null,
    categories: r.categories
      .filter((c) => c.items.length > 0)
      .map((c) => ({
        id: c.id,
        name: c.name,
        items: c.items.map((i) => ({
          id: i.id,
          name: i.name,
          description: i.description,
          price: toPaise(i.price),
          imageUrl: i.imageUrl,
          foodType: i.foodType,
          gstRate: i.gstRate === null ? defaultRate : Number(i.gstRate),
          isAvailable: i.isAvailable,
          isBestseller: i.isBestseller,
          spiceLevel: i.spiceLevel,
          variants: i.variants.map((v) => ({ id: v.id, name: v.name, price: toPaise(v.price) })),
          addonGroups: i.addonGroups.map((g) => ({
            id: g.id,
            name: g.name,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            options: g.options.map((o) => ({ id: o.id, name: o.name, price: toPaise(o.price) })),
          })),
        })),
      })),
  };

  return <MenuApp data={data} />;
}
