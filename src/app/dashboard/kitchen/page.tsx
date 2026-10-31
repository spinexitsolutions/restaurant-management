import { requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { KITCHEN_ROLES } from "@/server/orders";
import { KitchenBoard, type KitchenKot } from "./kitchen-board";

export const metadata = { title: "Kitchen" };

export default async function KitchenPage({ searchParams }: { searchParams: Promise<{ station?: string }> }) {
  const session = await requireRestaurantSession(KITCHEN_ROLES);
  const { station } = await searchParams;
  const stations = await db.kitchenStation.findMany({ where: { restaurantId: session.restaurantId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  // "main" = items with no station; a station id = that station only; nothing = everything.
  const active = station === "main" || stations.some((s) => s.id === station) ? station! : "all";
  const stationFilter = active === "all" ? {} : { stationId: active === "main" ? null : active };
  const kots = await db.kot.findMany({
    where: {
      restaurantId: session.restaurantId,
      status: "ACCEPTED",
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      items: { some: { status: { in: ["NEW", "PREPARING", "READY"] }, ...stationFilter } },
      order: { status: { not: "CANCELLED" } },
    },
    orderBy: { createdAt: "asc" },
    include: { items: { where: stationFilter, orderBy: { createdAt: "asc" } }, order: { select: { type: true, tableName: true, orderNumber: true } } },
  });

  const data: KitchenKot[] = kots.map((k) => ({
    id: k.id,
    kotNumber: k.kotNumber,
    createdAt: k.createdAt.toISOString(),
    note: k.note,
    label: k.order.tableName ? `Table ${k.order.tableName}` : `${k.order.type === "DELIVERY" ? "Delivery" : "Takeaway"} #${k.order.orderNumber}`,
    items: k.items
      .filter((i) => i.status !== "CANCELLED" && i.status !== "SERVED")
      .map((i) => ({
        id: i.id,
        name: i.name,
        variantName: i.variantName,
        addons: (i.addons as { name: string }[]).map((a) => a.name),
        quantity: i.quantity,
        foodType: i.foodType,
        note: i.note,
        status: i.status as "NEW" | "PREPARING" | "READY",
      })),
  }));

  return <KitchenBoard kots={data} stations={stations} active={active} />;
}
