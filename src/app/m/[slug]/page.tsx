import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { loadMenu } from "@/server/menu";
import { MenuApp, type MenuData } from "./menu-app";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const r = await db.restaurant.findUnique({ where: { slug }, select: { name: true, city: true } });
  return { title: r ? `${r.name} Menu` : "Menu", description: r ? `Menu of ${r.name}${r.city ? `, ${r.city}` : ""}` : undefined };
}

export default async function CustomerMenuPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { t } = await searchParams;
  const r = await db.restaurant.findUnique({ where: { slug } });
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
      qrOrderingEnabled: r.qrOrderingEnabled,
      gstEnabled: r.gstEnabled,
      gstMode: r.gstMode,
      serviceChargeRate: r.serviceChargeEnabled ? Number(r.serviceChargeRate) : 0,
    },
    table: table?.name ?? null,
    tableToken: table ? t! : null,
    categories: await loadMenu(r.id, defaultRate),
  };

  return <MenuApp data={data} />;
}
