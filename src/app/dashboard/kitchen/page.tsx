import { requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { KITCHEN_ROLES } from "@/server/orders";
import { KitchenBoard, type KitchenKot } from "./kitchen-board";

export const metadata = { title: "Kitchen" };

export default async function KitchenPage() {
  const session = await requireRestaurantSession(KITCHEN_ROLES);
  const kots = await db.kot.findMany({
    where: {
      restaurantId: session.restaurantId,
      status: "ACCEPTED",
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      items: { some: { status: { in: ["NEW", "PREPARING", "READY"] } } },
      order: { status: { not: "CANCELLED" } },
    },
    orderBy: { createdAt: "asc" },
    include: { items: { orderBy: { createdAt: "asc" } }, order: { select: { type: true, tableName: true, orderNumber: true } } },
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

  return <KitchenBoard kots={data} />;
}
